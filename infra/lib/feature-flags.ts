/**
 * CDK feature flags, applied in code so that `cdkd synth`, plain ts-node and
 * the unit tests all synthesize the same template.
 */
export const FEATURE_FLAGS: Record<string, boolean> = {
  // Grant access-log delivery with a bucket policy instead of ACLs.
  '@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy': true,
  '@aws-cdk/aws-s3:createDefaultLoggingPolicy': true,
  '@aws-cdk/aws-s3:publicAccessBlockedByDefault': true,
  '@aws-cdk/aws-iam:minimizePolicies': true,
  '@aws-cdk/aws-kms:aliasNameRef': true,
  '@aws-cdk/aws-kms:reduceCrossAccountRegionPolicyScope': true,
  '@aws-cdk/aws-events:requireEventBusPolicySid': true,
  '@aws-cdk/core:enablePartitionLiterals': true,
};
