# Requirements

## 機能要件
| ID | 要件 | 受け入れ基準 | 実装 |
| --- | --- | --- | --- |
| FR-01 | 正しさのプロパティを持つ SUT を用意する | 総額 = 口座数 × 初期残高、残高は負にならない | `sut/bank/app.py` |
| FR-02 | 既知のバグを切り替えで仕込める | `BANK_BUG_MODE=non_atomic_transfer` でプロパティ違反が起こり得る | 同上 |
| FR-03 | SDK アサーションでプロパティを宣言する | always / sometimes / reachable を使い分ける | `sut/workload/test/v1/bank/*` |
| FR-04 | Test Composer の命名規約でテストを組む | `/opt/antithesis/test/v1/bank/` に接頭辞付き実行ファイル | 同上 |
| FR-05 | setup 完了を Antithesis に通知する | SUT が healthy になった後に `setup_complete` | `sut/workload/entrypoint.py` |
| FR-06 | 無料で事前検証できる | ローカルで Compose 起動 → コマンド実行 → SDK 出力を判定。正常 = pass、バグ = fail | `scripts/local-smoke.sh`, `sut/tools/check_assertions.py` |
| FR-07 | AWS 上で自動実行する | ソース upload → CodeBuild で build / smoke / push | `infra/` |
| FR-08 | 契約後は設定だけで Antithesis 起動に切り替える | `antithesisEnabled=true` + テナント + レジストリ + シークレット投入で、レジストリ push と `launch_experiment` 呼び出し | `infra/buildspec/buildspec.yml` |
| FR-09 | 結果を通知する | ビルド完了（成功 / 失敗 / 停止）を SNS → メール | `infra/lib/...stack.ts` |
| FR-10 | 定期実行できる（任意） | `scheduleExpression` 指定時のみ EventBridge で起動 | 同上 |
| FR-11 | GitHub から起動できる（任意） | 長期キーなしの OIDC。指定リポジトリ + ブランチのみ | 同上, `.github/workflows/antithesis-run.yml` |
| FR-12 | cdkd でデプロイ / 削除できる | `cdkd deploy` / `cdkd destroy`、カスタムリソースなし | `infra/` |

## 非機能要件（詳細は construction/aws-pipeline/nfr-requirements）
| ID | 要件 |
| --- | --- |
| NFR-SEC-01 | 認証情報はコード・Git・イメージ・ログに残さない（Secrets Manager + KMS、取得は post_build のみ） |
| NFR-SEC-02 | 最小権限 IAM。Antithesis 無効時はシークレット読み取り権限自体を付与しない |
| NFR-SEC-03 | 保存時暗号化（KMS CMK、ローテーション有効）、通信時暗号化（TLS 強制） |
| NFR-SEC-04 | 公開アクセス禁止（S3 BPA、ECR はプライベート） |
| NFR-SEC-05 | サプライチェーン: 依存はバージョン固定（pip はハッシュ固定、Actions は SHA 固定）、ECR scan on push、タグ不変 |
| NFR-SEC-06 | cdk-nag AwsSolutions を synth ごとに実行し、未承認の指摘があれば失敗 |
| NFR-SEC-07 | 外部（Antithesis）へ送るのはダミーのコードとデータのみ |
| NFR-COST-01 | 既定構成は従量課金のみ（CodeBuild 分単位、S3/ECR 少量）。NAT・常時稼働リソースなし |
| NFR-OPS-01 | 1 コマンドで構築・削除できる（cdkd）。ログ保持 30 日 |
