#!/usr/bin/env node
import { App, DefaultStackSynthesizer, Tags, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AntithesisVerificationStack } from '../lib/antithesis-verification-stack';
import { loadConfig } from '../lib/config';
import { FEATURE_FLAGS } from '../lib/feature-flags';

const app = new App({ postCliContext: FEATURE_FLAGS });
const config = loadConfig(app.node);

const stack = new AntithesisVerificationStack(app, `AntithesisVerification-${config.envName}`, {
  config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
  description: 'Antithesis verification environment (deployed with cdkd)',
  analyticsReporting: false,
  // cdkd keeps its own state and does not use the CDK bootstrap stack, so the
  // bootstrap-version check (an SSM parameter lookup) is not generated.
  synthesizer: new DefaultStackSynthesizer({ generateBootstrapVersionRule: false }),
});

Tags.of(stack).add('Project', 'antithesis-verification');
Tags.of(stack).add('Environment', config.envName);
Tags.of(stack).add('ManagedBy', 'cdkd');

// Security baseline: every synth is checked against AWS Solutions rules.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
