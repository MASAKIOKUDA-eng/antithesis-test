# Build and Test（2026-11-12 実行結果）

| # | 検査 | コマンド | 結果 |
| --- | --- | --- | --- |
| 1 | 型検査 | `cd infra && npx tsc --noEmit` | ✅ pass |
| 2 | ユニットテスト（19 件） | `cd infra && npx jest` | ✅ 19/19 pass |
| 3 | cdkd 合成 + cdk-nag | `cd infra && npx cdkd synth` | ✅ 18 リソース、未承認の指摘 0（全機能有効構成でも 0） |
| 4 | 依存の脆弱性 | `npm audit --omit=dev --audit-level=high` | ✅ high 以上 0（moderate 3: aws-cdk-lib 同梱 minimatch、synth 時のみ） |
| 5 | Python 静的解析 | `bandit -r sut` | ✅ 指摘 0 |
| 6 | スモーク（正常） | `./scripts/local-smoke.sh` | ✅ `outcome=pass expected=pass`（13 アサーション、失敗 0） |
| 7 | スモーク（バグ仕込み） | `BANK_BUG_MODE=non_atomic_transfer ./scripts/local-smoke.sh` | ✅ `outcome=fail expected=fail` — `Always: Money is conserved (anytime)` 違反を検出（total 355 / 期待 500） |
| 8 | 起動リクエスト本文 | buildspec 内の python を単体実行 | ✅ 想定どおりの `params` JSON |
| 9 | buildspec シェル構文 | `bash -n`（各ブロック） | ✅ |

## 未実施（理由）
| 検査 | 理由 | 実施方法 |
| --- | --- | --- |
| `cdkd deploy` / 実 CodeBuild 実行 | このセッションに AWS 認証情報がない | `operation/deployment-execution/runbook.md` |
| Antithesis 実起動 | テナント・API キー未発行（Q-03） | 同上 Step 3 |
| shellcheck | 実行環境に未導入 | CI へ追加を推奨 |

## 補足
- テスト環境のプロキシ証明書の都合で、6・7 は CA を追加した一時 Dockerfile でワークロードを build して実施した
  （リポジトリの Dockerfile には含めていない。通常の環境・CodeBuild ではそのまま build できる）。
- ローカルスモークは非決定的な簡易版。正常版で偶然 pass、バグ版で偶然 pass する可能性はゼロではない
  （バグ版は anytime の並行読み取りでほぼ確実に検出）。Antithesis 本番では決定論的に探索・再現される。
