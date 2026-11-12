import * as fs from 'fs';
import * as path from 'path';
import {
  Aws,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Token,
  Validations,
  aws_codebuild as codebuild,
  aws_ecr as ecr,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_kms as kms,
  aws_logs as logs,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sns as sns,
  aws_sns_subscriptions as subs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as YAML from 'yaml';
import { VerificationConfig } from './config';

export const SOURCE_OBJECT_KEY = 'source/source.zip';
export const IMAGE_NAMES = ['antithesis-bank', 'antithesis-workload', 'antithesis-config'] as const;

export interface AntithesisVerificationStackProps extends StackProps {
  readonly config: VerificationConfig;
}

/**
 * Verification environment for Antithesis on AWS.
 *
 *   developer / GitHub Actions (OIDC)
 *        | upload source.zip + StartBuild
 *        v
 *   S3 (source, KMS) --> CodeBuild (privileged docker)
 *                          |-- build SUT + workload images
 *                          |-- local smoke test (Test Composer + SDK asserts)
 *                          |-- push --> ECR (scan on push, immutable tags)
 *                          '-- [antithesisEnabled] push --> Antithesis registry
 *                                                  launch --> Antithesis webhook API
 *   EventBridge (build state) --> SNS (KMS) --> e-mail
 */
export class AntithesisVerificationStack extends Stack {
  constructor(scope: Construct, id: string, props: AntithesisVerificationStackProps) {
    super(scope, id, props);
    const cfg = props.config;
    const prefix = `antithesis-${cfg.envName}`;

    // ---------------------------------------------------------------- KMS
    const key = new kms.Key(this, 'Key', {
      alias: `alias/${prefix}`,
      description: 'Encrypts the Antithesis verification environment (S3, ECR, logs, secrets, SNS, CodeBuild)',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
      pendingWindow: Duration.days(7),
    });
    // CloudWatch Logs needs explicit permission to use a CMK.
    key.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowCloudWatchLogs',
      principals: [new iam.ServicePrincipal(`logs.${Aws.REGION}.amazonaws.com`)],
      actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
      resources: ['*'],
      conditions: {
        ArnLike: { 'kms:EncryptionContext:aws:logs:arn': `arn:${Aws.PARTITION}:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:*` },
      },
    }));
    // EventBridge publishes to the KMS-encrypted SNS topic.
    key.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowEventBridgeToEncryptedTopic',
      principals: [new iam.ServicePrincipal('events.amazonaws.com')],
      actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
      resources: ['*'],
      conditions: { StringEquals: { 'aws:SourceAccount': Aws.ACCOUNT_ID } },
    }));

    // ---------------------------------------------------------------- S3
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      // Server access log delivery only supports SSE-S3.
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      versioned: true,
      lifecycleRules: [{ expiration: Duration.days(90), noncurrentVersionExpiration: Duration.days(7) }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const sourceBucket = new s3.Bucket(this, 'SourceBucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      versioned: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'source-bucket/',
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30), abortIncompleteMultipartUploadAfter: Duration.days(1) }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------- ECR
    const repositories = IMAGE_NAMES.map((name) => new ecr.Repository(this, `Repo-${name}`, {
      repositoryName: `${cfg.envName}/${name}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      encryption: ecr.RepositoryEncryption.KMS,
      encryptionKey: key,
      lifecycleRules: [{ maxImageCount: 20, description: 'keep the 20 most recent images' }],
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true, // native ECR property (no custom resource)
    }));
    const ecrRegistry = `${Aws.ACCOUNT_ID}.dkr.ecr.${Aws.REGION}.${Aws.URL_SUFFIX}/${cfg.envName}`;

    // ---------------------------------------------------------------- Secrets
    // Values are NEVER in code. Put them in after deploy:
    //   aws secretsmanager put-secret-value --secret-id <arn> --secret-string file://...
    const apiKeySecret = new secretsmanager.Secret(this, 'AntithesisApiKey', {
      secretName: `${prefix}/api-key`,
      description: 'Antithesis API key (sent as Authorization: Bearer). Replace the generated placeholder.',
      encryptionKey: key,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const registryKeySecret = new secretsmanager.Secret(this, 'AntithesisRegistryKey', {
      secretName: `${prefix}/registry-key`,
      description: 'Antithesis container registry key ($TENANT.key.json contents). Replace the generated placeholder.',
      encryptionKey: key,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------- CodeBuild
    const logGroup = new logs.LogGroup(this, 'BuildLogs', {
      logGroupName: `/aws/codebuild/${prefix}`,
      retention: logs.RetentionDays.ONE_MONTH,
      encryptionKey: key,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const buildSpecObject = YAML.parse(
      fs.readFileSync(path.join(__dirname, '..', 'buildspec', 'buildspec.yml'), 'utf8'),
    );

    const project = new codebuild.Project(this, 'Pipeline', {
      projectName: prefix,
      description: 'Builds the SUT, runs the local Antithesis smoke test, pushes images and (optionally) launches an Antithesis run',
      source: codebuild.Source.s3({ bucket: sourceBucket, path: SOURCE_OBJECT_KEY }),
      buildSpec: codebuild.BuildSpec.fromObject(buildSpecObject),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        // Required for docker build / docker compose. See NFR design for mitigations.
        privileged: true,
        environmentVariables: {
          ECR_REGISTRY: { value: ecrRegistry },
          BANK_BUG_MODE: { value: cfg.bankBugMode },
          SMOKE_ROUNDS: { value: '3' },
          ANTITHESIS_ENABLED: { value: String(cfg.antithesisEnabled) },
          ANTITHESIS_TENANT: { value: cfg.antithesisTenant },
          ANTITHESIS_REGISTRY: { value: cfg.antithesisRegistry },
          ANTITHESIS_WEBHOOK: { value: cfg.antithesisWebhook },
          ANTITHESIS_DURATION_MINUTES: { value: String(cfg.antithesisDurationMinutes) },
          ANTITHESIS_RECIPIENTS: { value: '' },
          // ARNs only; the values are fetched inside post_build.
          ANTITHESIS_API_KEY_SECRET_ARN: { value: apiKeySecret.secretArn },
          ANTITHESIS_REGISTRY_KEY_SECRET_ARN: { value: registryKeySecret.secretArn },
        },
      },
      encryptionKey: key,
      timeout: Duration.minutes(60),
      queuedTimeout: Duration.hours(2),
      concurrentBuildLimit: 1,
      logging: { cloudWatch: { logGroup } },
    });

    sourceBucket.grantRead(project);
    repositories.forEach((repo) => repo.grantPush(project));
    // GetAuthorizationToken does not support resource-level permissions.
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    if (cfg.antithesisEnabled) {
      apiKeySecret.grantRead(project);
      registryKeySecret.grantRead(project);
    }
    key.grantEncryptDecrypt(project);

    // ---------------------------------------------------------------- Notifications
    const topic = new sns.Topic(this, 'BuildNotifications', {
      topicName: `${prefix}-builds`,
      masterKey: key,
      enforceSSL: true,
    });
    if (cfg.notificationEmail) topic.addSubscription(new subs.EmailSubscription(cfg.notificationEmail));

    new events.Rule(this, 'BuildStateRule', {
      description: 'Notify on completed Antithesis verification builds',
      eventPattern: {
        source: ['aws.codebuild'],
        detailType: ['CodeBuild Build State Change'],
        detail: {
          'project-name': [project.projectName],
          'build-status': ['SUCCEEDED', 'FAILED', 'STOPPED'],
        },
      },
      targets: [new targets.SnsTopic(topic, {
        message: events.RuleTargetInput.fromText(
          `Antithesis verification build ${events.EventField.fromPath('$.detail.build-status')}: ${events.EventField.fromPath('$.detail.build-id')}`,
        ),
      })],
    });

    // Optional nightly (or any) schedule; the latest uploaded source is built.
    if (cfg.scheduleExpression) {
      new events.Rule(this, 'ScheduleRule', {
        description: 'Scheduled Antithesis verification build',
        schedule: events.Schedule.expression(cfg.scheduleExpression),
        targets: [new targets.CodeBuildProject(project)],
      });
    }

    // ---------------------------------------------------------------- GitHub OIDC (optional)
    if (cfg.githubRepository) {
      const providerArn = cfg.githubOidcProviderArn || new iam.OidcProviderNative(this, 'GitHubOidc', {
        url: 'https://token.actions.githubusercontent.com',
        clientIds: ['sts.amazonaws.com'],
      }).oidcProviderArn;

      const ciRole = new iam.Role(this, 'GitHubActionsRole', {
        roleName: `${prefix}-github-actions`,
        description: `Lets ${cfg.githubRepository}@${cfg.githubBranch} upload source and start the verification build`,
        maxSessionDuration: Duration.hours(1),
        assumedBy: new iam.WebIdentityPrincipal(providerArn, {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `repo:${cfg.githubRepository}:ref:refs/heads/${cfg.githubBranch}`,
          },
        }),
      });
      ciRole.addToPolicy(new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [sourceBucket.arnForObjects(SOURCE_OBJECT_KEY)],
      }));
      ciRole.addToPolicy(new iam.PolicyStatement({
        actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
        resources: [project.projectArn],
      }));
      ciRole.addToPolicy(new iam.PolicyStatement({
        actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
        resources: [key.keyArn],
        conditions: { StringEquals: { 'kms:ViaService': `s3.${Aws.REGION}.amazonaws.com` } },
      }));
      new CfnOutput(this, 'GitHubActionsRoleArn', { value: ciRole.roleArn });
    }

    // ---------------------------------------------------------------- Outputs
    new CfnOutput(this, 'SourceBucketName', { value: sourceBucket.bucketName });
    new CfnOutput(this, 'AccessLogsBucketName', { value: accessLogsBucket.bucketName });
    new CfnOutput(this, 'SourceObjectKey', { value: SOURCE_OBJECT_KEY });
    new CfnOutput(this, 'ProjectName', { value: project.projectName });
    new CfnOutput(this, 'EcrRegistryPrefix', { value: ecrRegistry });
    new CfnOutput(this, 'ApiKeySecretArn', { value: apiKeySecret.secretArn });
    new CfnOutput(this, 'RegistryKeySecretArn', { value: registryKeySecret.secretArn });
    new CfnOutput(this, 'NotificationTopicArn', { value: topic.topicArn });

    // ---------------------------------------------------------------- cdk-nag acknowledgements (each justified)
    Validations.of(accessLogsBucket).acknowledge({
      id: 'AwsSolutions-S1', reason: 'This is the access-log destination bucket itself.',
    });
    for (const secret of [apiKeySecret, registryKeySecret]) {
      Validations.of(secret).acknowledge({
        id: 'AwsSolutions-SMG4',
        reason: 'Third-party (Antithesis) issued credential; rotated by re-issuing it with Antithesis and running put-secret-value.',
      });
    }
    Validations.of(project).acknowledge({
      id: 'AwsSolutions-CB3',
      reason: 'Privileged mode is required for docker build / docker compose. No VPC access, credentials fetched only in post_build, concurrency 1.',
    });

    // IAM5 findings are acknowledged one by one (cdk-nag v3), each scoped to
    // this stack's own resources:
    //  - s3:GetObject*/GetBucket*/List* on the source bucket (CDK grantRead)
    //  - kms:GenerateDataKey*/ReEncrypt* on the stack CMK (CDK grantEncryptDecrypt)
    //  - log streams / report groups under this project's own name
    //  - Resource::* only for ecr:GetAuthorizationToken (no resource-level support)
    const region = Token.isUnresolved(this.region) ? '<AWS::Region>' : this.region;
    const account = Token.isUnresolved(this.account) ? '<AWS::AccountId>' : this.account;
    const projectRef = `<${this.getLogicalId(project.node.defaultChild as codebuild.CfnProject)}>`;
    const iam5 = [
      'Action::s3:GetBucket*',
      'Action::s3:GetObject*',
      'Action::s3:List*',
      `Resource::<${this.getLogicalId(sourceBucket.node.defaultChild as s3.CfnBucket)}.Arn>/*`,
      'Action::kms:GenerateDataKey*',
      'Action::kms:ReEncrypt*',
      `Resource::arn:aws:logs:${region}:${account}:log-group:/aws/codebuild/${projectRef}:*`,
      `Resource::arn:aws:codebuild:${region}:${account}:report-group/${projectRef}-*`,
      'Resource::*',
    ];
    for (const finding of iam5) {
      Validations.of(project).acknowledge({
        id: `AwsSolutions-IAM5[${finding}]`,
        reason: 'Scoped to this stack\'s own bucket / CMK / project; Resource::* is only ecr:GetAuthorizationToken, which has no resource-level permissions.',
      });
    }
  }
}
