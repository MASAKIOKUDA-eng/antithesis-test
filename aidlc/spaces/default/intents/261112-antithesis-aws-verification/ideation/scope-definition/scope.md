# Scope Definition

## In scope
- 検証対象システム（SUT）: 送金台帳サービス（保存則 = 総額不変 がプロパティ）
- 仕込みバグ: `BANK_BUG_MODE=non_atomic_transfer`（引き落としと入金を別トランザクションで commit）
- ワークロード: Antithesis Python SDK（`always` / `sometimes` / `reachable`）+ Test Composer
  （`first_` / `parallel_driver_` / `singleton_driver_` / `anytime_` / `eventually_`）
- Docker Compose 構成と config イメージ
- ローカルスモーク（無料の事前検証、SDK 出力を判定）
- AWS: S3（ソース）、CodeBuild、ECR、Secrets Manager、KMS、CloudWatch Logs、EventBridge、SNS、
  任意で GitHub OIDC ロール・定期実行
- cdkd によるデプロイ手順、GitHub Actions（CI / 手動起動）

## Out of scope
- Antithesis 本体の契約・テナント発行（人が行う）
- Kubernetes 構成（Compose のみ）
- カバレッジ計測用のインストルメンテーション
- 本番運用（マルチアカウント、承認フロー、DR）
- Snouty CLI 連携（Webhook API で代替。要望があれば追加）
