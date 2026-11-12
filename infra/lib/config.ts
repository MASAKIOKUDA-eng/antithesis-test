import { Node } from 'constructs';

export type BugMode = 'none' | 'non_atomic_transfer';

/** Settings read from CDK context (cdk.json or `-c key=value`). */
export interface VerificationConfig {
  readonly envName: string;
  /** false = free local verification only (build + smoke + push to ECR). */
  readonly antithesisEnabled: boolean;
  readonly antithesisTenant: string;
  /** Registry Antithesis pulls from, e.g. the one issued with your tenant. */
  readonly antithesisRegistry: string;
  readonly antithesisWebhook: string;
  readonly antithesisDurationMinutes: number;
  readonly bankBugMode: BugMode;
  readonly notificationEmail: string;
  readonly scheduleExpression: string;
  /** "owner/repo" — enables a GitHub Actions OIDC role when set. */
  readonly githubRepository: string;
  readonly githubBranch: string;
  /** Reuse an existing GitHub OIDC provider instead of creating one. */
  readonly githubOidcProviderArn: string;
}

const str = (node: Node, key: string, fallback = ''): string => {
  const v = node.tryGetContext(key);
  return v === undefined || v === null ? fallback : String(v).trim();
};

const bool = (node: Node, key: string): boolean => {
  const v = node.tryGetContext(key);
  return v === true || v === 'true';
};

/** Reads and validates context. Invalid input fails synth, never deploys. */
export function loadConfig(node: Node): VerificationConfig {
  const cfg: VerificationConfig = {
    envName: str(node, 'envName', 'dev'),
    antithesisEnabled: bool(node, 'antithesisEnabled'),
    antithesisTenant: str(node, 'antithesisTenant'),
    antithesisRegistry: str(node, 'antithesisRegistry'),
    antithesisWebhook: str(node, 'antithesisWebhook', 'basic_test'),
    antithesisDurationMinutes: Number(str(node, 'antithesisDurationMinutes', '30')),
    bankBugMode: str(node, 'bankBugMode', 'none') as BugMode,
    notificationEmail: str(node, 'notificationEmail'),
    scheduleExpression: str(node, 'scheduleExpression'),
    githubRepository: str(node, 'githubRepository'),
    githubBranch: str(node, 'githubBranch', 'main'),
    githubOidcProviderArn: str(node, 'githubOidcProviderArn'),
  };

  const errors: string[] = [];
  if (!/^[a-z0-9-]{1,16}$/.test(cfg.envName)) errors.push('envName must match ^[a-z0-9-]{1,16}$');
  if (!['none', 'non_atomic_transfer'].includes(cfg.bankBugMode)) {
    errors.push('bankBugMode must be "none" or "non_atomic_transfer"');
  }
  if (!Number.isInteger(cfg.antithesisDurationMinutes) || cfg.antithesisDurationMinutes < 1 || cfg.antithesisDurationMinutes > 1440) {
    errors.push('antithesisDurationMinutes must be an integer between 1 and 1440');
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(cfg.antithesisWebhook)) errors.push('antithesisWebhook has invalid characters');
  if (cfg.antithesisEnabled) {
    if (!/^[a-z0-9-]{1,63}$/.test(cfg.antithesisTenant)) errors.push('antithesisTenant is required when antithesisEnabled=true');
    if (!/^[a-z0-9.-]+(:[0-9]+)?(\/[a-z0-9._-]+)+$/.test(cfg.antithesisRegistry)) {
      errors.push('antithesisRegistry (e.g. "<host>/<project>/<repository>") is required when antithesisEnabled=true');
    }
  }
  if (cfg.notificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.notificationEmail)) {
    errors.push('notificationEmail is not a valid address');
  }
  if (cfg.scheduleExpression && !/^(cron|rate)\(.+\)$/.test(cfg.scheduleExpression)) {
    errors.push('scheduleExpression must be cron(...) or rate(...)');
  }
  if (cfg.githubRepository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.githubRepository)) {
    errors.push('githubRepository must be "owner/repo"');
  }
  if (!/^[A-Za-z0-9_./-]{1,100}$/.test(cfg.githubBranch)) errors.push('githubBranch has invalid characters');
  if (cfg.githubOidcProviderArn && !/^arn:aws[a-z-]*:iam::\d{12}:oidc-provider\/token\.actions\.githubusercontent\.com$/.test(cfg.githubOidcProviderArn)) {
    errors.push('githubOidcProviderArn must be the ARN of the token.actions.githubusercontent.com provider');
  }
  if (errors.length > 0) throw new Error(`Invalid context:\n - ${errors.join('\n - ')}`);
  return cfg;
}
