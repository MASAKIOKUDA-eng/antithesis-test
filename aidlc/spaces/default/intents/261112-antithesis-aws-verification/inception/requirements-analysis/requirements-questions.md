# Requirements Questions（回答待ち / 仮置きで進めた項目）

非同期セッションのため、以下は **[仮回答]** で実装を進めた。違う場合はこのファイルに回答を書けば、
該当ステージから作り直す（AI-DLC の Feedback Loop）。

| ID | 質問 | 仮回答 | 変更時の影響範囲 |
| --- | --- | --- | --- |
| Q-01 | AWS リージョンは？ | `ap-northeast-1`（`CDK_DEFAULT_REGION` で上書き可） | なし（環境変数） |
| Q-02 | 検証対象は自社コードか、ダミーか？ | ダミー（送金台帳のトイシステム）。資料の「検証ではダミーのコードとデータを使う」に従う | U1 を差し替え |
| Q-03 | Antithesis の契約状況は？（Teams / PoC / 未契約） | 未契約。`antithesisEnabled=false` を既定に | 設定値のみ |
| Q-04 | 起動 API・認証方式は？ | `POST https://<tenant>.antithesis.com/api/v1/launch_experiment/<webhook>`、`Authorization: Bearer <API key>`（公式 trigger action のソースで確認）。webhook 名は `basic_test` を既定 | 設定値 `antithesisWebhook` |
| Q-05 | Antithesis のコンテナレジストリと認証は？ | テナント発行のレジストリ（例: `us-central1-docker.pkg.dev/<project>/<tenant>-repository`）に、`$TENANT.key.json` を `_json_key` ユーザーで docker login。**公式ドキュメントで要確認** | 設定値 `antithesisRegistry`、buildspec の login 1 行 |
| Q-06 | テスト時間（duration）は？ | 30 分（`antithesisDurationMinutes`）。Teams プランは月 2,400 コンピュート時間 | 設定値 |
| Q-07 | GitHub Actions から起動したいか？ | 任意機能として実装（`githubRepository` 指定時のみ） | なし |
| Q-08 | 通知先は？ | 任意（`notificationEmail`）。未指定ならトピックのみ作成 | なし |
| Q-09 | SUT の言語は？ | Python（SDK が依存ゼロで、ローカル出力による判定が容易） | U1 |
