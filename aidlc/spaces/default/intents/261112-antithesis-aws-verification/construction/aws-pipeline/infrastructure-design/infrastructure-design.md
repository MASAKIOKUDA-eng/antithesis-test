# U2 aws-pipeline — Infrastructure Design

```mermaid
flowchart LR
  dev["開発者<br/>scripts/start-run.sh"] -->|git archive → PutObject| s3[(S3 source<br/>KMS / BPA / TLS)]
  gha["GitHub Actions<br/>(OIDC, main のみ)"] -->|PutObject + StartBuild| s3
  sched["EventBridge schedule<br/>(任意)"] --> cb
  s3 --> cb["CodeBuild<br/>privileged / no VPC / 同時実行1"]
  cb -->|push| ecr[(ECR x3<br/>scan on push / 不変タグ / KMS)]
  cb -->|post_build のみ取得| sm[(Secrets Manager<br/>api-key / registry-key)]
  cb -.->|antithesisEnabled=true| areg[(Antithesis registry)]
  cb -.->|launch_experiment| aapi["Antithesis API<br/>https://TENANT.antithesis.com"]
  cb --> logs[(CloudWatch Logs<br/>KMS / 30日)]
  cb -->|Build State Change| eb[EventBridge rule] --> sns[(SNS KMS)] --> mail[メール]
  s3 --> s3log[(S3 access logs)]
  kms{{KMS CMK<br/>rotation}} -.-> s3 & ecr & sm & logs & sns & cb
```

## リソース一覧（既定構成 18 リソース）
| リソース | 主な設定 |
| --- | --- |
| KMS Key + Alias | ローテーション有効、Logs / EventBridge 用のキーポリシー（アカウント条件付き） |
| S3 AccessLogsBucket | SSE-S3（ログ配信の制約）、BPA、TLS 強制、90 日で失効 |
| S3 SourceBucket | SSE-KMS + Bucket Key、BPA、TLS1.2+、バージョニング、アクセスログ |
| ECR x3 | `<env>/antithesis-{bank,workload,config}`、scan on push、IMMUTABLE、KMS、最新 20 件保持 |
| Secrets Manager x2 | `antithesis-<env>/api-key`, `/registry-key`。作成時はランダムなプレースホルダ |
| CodeBuild Project | STANDARD_7_0 / MEDIUM / privileged、buildspec は infra 側に固定、60 分 |
| LogGroup | KMS、30 日 |
| SNS Topic + Policy | KMS、TLS 強制 |
| EventBridge Rule | SUCCEEDED / FAILED / STOPPED を通知 |
| （任意）EventBridge schedule | `scheduleExpression` |
| （任意）OIDC Provider + Role | `githubRepository` / `githubBranch`、既存 Provider の再利用可 |

## cdkd 適合性
- 全リソース型が cdkd の SDK プロバイダ対応（OIDC Provider のみ Cloud Control フォールバック）
- カスタムリソース・Lambda・アセット（Docker/ファイル）なし。`autoDeleteObjects` も不使用
- `generateBootstrapVersionRule: false`（cdkd は CDK bootstrap を使わない）
- フィーチャーフラグはコード（`lib/feature-flags.ts`）で適用し、cdkd / テストで同一テンプレートを生成

## 設定（CDK context）
| key | 既定 | 説明 |
| --- | --- | --- |
| `envName` | `dev` | 名前の接頭辞 |
| `antithesisEnabled` | `false` | true で Antithesis へ push / 起動、シークレット読み取り権限を付与 |
| `antithesisTenant` | `""` | `<tenant>.antithesis.com` |
| `antithesisRegistry` | `""` | Antithesis 発行のレジストリパス |
| `antithesisWebhook` | `basic_test` | `launch_experiment/<webhook>` |
| `antithesisDurationMinutes` | `30` | 1〜1440 |
| `bankBugMode` | `none` | 既定のバグモード（起動時に上書き可） |
| `notificationEmail` | `""` | 通知先 |
| `scheduleExpression` | `""` | `cron(...)` / `rate(...)` |
| `githubRepository` / `githubBranch` / `githubOidcProviderArn` | `""` / `main` / `""` | GitHub OIDC |
