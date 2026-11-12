# Feasibility & Constraints

| # | 制約・前提 | 影響 | 対応 |
| --- | --- | --- | --- |
| C1 | Antithesis は SaaS。テストは Antithesis 側で実行され、AWS 上では動かない | AWS が担うのは「ビルド・事前検証・送信・起動」まで | パイプライン（CodeBuild）中心の構成にする |
| C2 | 対象は x86 のコンテナ化ソフトウェア、テスト環境はインターネット非接続 | イメージは事前に全て push、外部依存はモック | `linux/amd64` 固定、SUT は標準ライブラリのみ |
| C3 | 契約前はレジストリ・API キーがない | 本番起動はテスト不能 | `antithesisEnabled=false`（既定）で無料検証のみ動く設計 |
| C4 | 本セッションから antithesis.com のドキュメントに到達不可 | API 仕様の一次確認ができない | 公式 GitHub（trigger action のソース）で `launch_experiment` API と Bearer 認証を確認。未確認点は Q-03〜Q-05 として明記 |
| C5 | cdkd は「dev/test 用途、本番非推奨」 | 本番運用には不向き | 本件は検証環境なので合致。`cdkd export` で CloudFormation へ移行可能 |
| C6 | cdkd は SDK / Cloud Control で直接作成 | カスタムリソース（Lambda）や未対応型は避けたい | 使用リソースは全て cdkd の SDK プロバイダ対応型。OIDC Provider のみ Cloud Control フォールバック |
| C7 | Docker ビルドには CodeBuild の特権モードが必要 | コンテナ脱出時の影響が大きい | 認証情報を信頼できない処理の後でのみ取得、VPC なし、同時実行 1（NFR Design 参照） |
| C8 | AWS 認証情報がこのセッションにない | 実デプロイは未実施 | synth / cdk-nag / ユニットテスト / ローカルスモークで検証し、runbook を用意 |

結論: **実現可能**。C3・C4 の未確認点は設定値で吸収できるようにする。
