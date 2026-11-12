# U3 Code Generation Summary

| パス | 内容 |
| --- | --- |
| `.github/workflows/ci.yml` | PR / main: tsc・jest・`cdkd synth`（cdk-nag）・npm audit、スモーク（正常 / バグの 2 通り） |
| `.github/workflows/antithesis-run.yml` | 手動起動。OIDC で AWS ロールを引き受け、`start-run.sh` を実行（main のみ） |
| `scripts/start-run.sh` | コミット済みソースのみ zip → S3 → StartBuild（任意で完了待ち） |

権限: `contents: read`（+ 起動のみ `id-token: write`）、`persist-credentials: false`、Actions は SHA 固定。
GitHub に保存するのは **変数**（ロール ARN 等）のみで、シークレットは不要。
