import { App, Validations } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AntithesisVerificationStack } from '../lib/antithesis-verification-stack';
import { loadConfig } from '../lib/config';
import { FEATURE_FLAGS } from '../lib/feature-flags';

const ENABLED = {
  antithesisEnabled: true,
  antithesisTenant: 'example',
  antithesisRegistry: 'us-central1-docker.pkg.dev/example-project/example-repository',
};

function build(context: Record<string, unknown> = {}, withNag = false) {
  const app = new App({ context: { ...FEATURE_FLAGS, ...context } });
  const stack = new AntithesisVerificationStack(app, 'Test', {
    config: loadConfig(app.node),
    env: { account: '123456789012', region: 'ap-northeast-1' },
  });
  if (withNag) Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
  return { app, stack, template: Template.fromStack(stack) };
}

describe('security baseline', () => {
  const { template } = build();

  test('KMS key rotation is enabled', () => {
    template.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
  });

  test('every bucket blocks public access and is encrypted', () => {
    const buckets = template.findResources('AWS::S3::Bucket');
    expect(Object.keys(buckets)).toHaveLength(2);
    for (const b of Object.values(buckets)) {
      expect(b.Properties.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
      });
      expect(b.Properties.BucketEncryption).toBeDefined();
    }
  });

  test('every bucket policy denies non-TLS access', () => {
    const policies = template.findResources('AWS::S3::BucketPolicy');
    expect(Object.keys(policies)).toHaveLength(2);
    for (const p of Object.values(policies)) {
      expect(p.Properties.PolicyDocument.Statement).toEqual(expect.arrayContaining([
        expect.objectContaining({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
      ]));
    }
  });

  test('ECR repositories scan on push, use immutable tags and KMS', () => {
    template.resourceCountIs('AWS::ECR::Repository', 3);
    template.allResourcesProperties('AWS::ECR::Repository', {
      ImageScanningConfiguration: { ScanOnPush: true },
      ImageTagMutability: 'IMMUTABLE',
      EncryptionConfiguration: { EncryptionType: 'KMS' },
    });
  });

  test('secrets are KMS-encrypted and not exposed as CodeBuild env vars', () => {
    template.allResourcesProperties('AWS::SecretsManager::Secret', { KmsKeyId: Match.anyValue() });
    const project = Object.values(template.findResources('AWS::CodeBuild::Project'))[0];
    const envVars = project.Properties.Environment.EnvironmentVariables as Array<{ Type?: string }>;
    expect(envVars.filter((v) => v.Type === 'SECRETS_MANAGER')).toHaveLength(0);
  });

  test('log group is encrypted with retention', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { KmsKeyId: Match.anyValue(), RetentionInDays: 30 });
  });

  test('SNS topic is encrypted', () => {
    template.hasResourceProperties('AWS::SNS::Topic', { KmsMasterKeyId: Match.anyValue() });
  });

  test('no custom resources (cdkd deploys everything via SDK / Cloud Control)', () => {
    const types = Object.values(template.toJSON().Resources).map((r: any) => r.Type as string);
    expect(types.filter((t) => t.startsWith('Custom::') || t === 'AWS::Lambda::Function')).toEqual([]);
  });
});

describe('Antithesis mode switch', () => {
  const readsSecrets = (template: Template) => JSON.stringify(template.findResources('AWS::IAM::Policy'))
    .includes('secretsmanager:GetSecretValue');

  test('local mode: the build role cannot read the Antithesis secrets', () => {
    expect(readsSecrets(build().template)).toBe(false);
  });

  test('antithesis mode: the build role can read the secrets', () => {
    const { template } = build(ENABLED);
    expect(readsSecrets(template)).toBe(true);
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: Match.objectLike({
        PrivilegedMode: true,
        EnvironmentVariables: Match.arrayWith([{ Name: 'ANTITHESIS_ENABLED', Type: 'PLAINTEXT', Value: 'true' }]),
      }),
    });
  });
});

describe('GitHub OIDC role', () => {
  test('trust is pinned to repository + branch and audience', () => {
    const { template } = build({ githubRepository: 'owner/repo', githubBranch: 'main' });
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': 'repo:owner/repo:ref:refs/heads/main',
            },
          },
        })],
      },
    });
  });

  test('not created unless requested', () => {
    build().template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  });
});

describe('cdk-nag AwsSolutions', () => {
  test.each([
    ['default', {}],
    ['all features', { ...ENABLED, githubRepository: 'owner/repo', scheduleExpression: 'rate(1 day)', notificationEmail: 'ops@example.com' }],
  ])('%s configuration has no unacknowledged findings', (_name, context) => {
    const { app } = build(context, true);
    expect(() => app.synth()).not.toThrow();
  });
});

describe('context validation', () => {
  test.each([
    [{ bankBugMode: 'oops' }, /bankBugMode/],
    [{ antithesisEnabled: true }, /antithesisTenant/],
    [{ ...ENABLED, antithesisRegistry: 'https://evil;rm -rf' }, /antithesisRegistry/],
    [{ githubRepository: 'not a repo' }, /githubRepository/],
    [{ antithesisDurationMinutes: 0 }, /antithesisDurationMinutes/],
  ])('rejects %p', (context, message) => {
    expect(() => build(context)).toThrow(message);
  });
});
