# U2 aws-pipeline — NFR Requirements

| 区分 | 要件 | 目標 / 判定 |
| --- | --- | --- |
| セキュリティ | 認証情報の秘匿 | コード・Git・イメージ・CodeBuild 環境変数に値を持たない。Secrets Manager（KMS）にのみ保存 |
| セキュリティ | 最小権限 | 用途別に Resource を限定。`Resource: *` は `ecr:GetAuthorizationToken` のみ |
| セキュリティ | 暗号化 | KMS CMK（自動ローテーション）で S3 / ECR / Secrets / Logs / SNS / CodeBuild を暗号化。S3 は TLS1.2 以上を強制 |
| セキュリティ | 外部公開なし | S3 BPA 全有効、ECR プライベート、インバウンドを受けるリソースなし |
| セキュリティ | 監査 | S3 サーバーアクセスログ、CodeBuild ログ 30 日、ECR scan on push |
| セキュリティ | 継続検査 | cdk-nag AwsSolutions を synth 毎に実行（CI でも実行） |
| 信頼性 | 失敗時は何も送らない | build 失敗時は ECR / Antithesis へ push しない |
| コスト | 常時稼働なし | 既定構成は S3・ECR の保管料と CodeBuild 実行分のみ |
| 運用 | 構築 / 削除 | `cdkd deploy` / `cdkd destroy`。カスタムリソースなし |
| 移植性 | env 非依存 | アカウント / リージョンは環境変数から。パーティションは `aws` 前提 |
