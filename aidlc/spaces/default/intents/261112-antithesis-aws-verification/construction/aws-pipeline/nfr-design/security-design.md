# U2 aws-pipeline — NFR Design（セキュリティ設計 / 脅威モデル）

## 信頼境界
```
[開発者 / GitHub OIDC] --(s3:PutObject 1 キーのみ)--> [S3 source.zip]  ← 信頼できない入力
                                                          |
                         [CodeBuild 特権コンテナ] <------'
   pre_build/build: 入力検証・docker build・スモーク（ソース由来のコードが動く）  ← 秘密なし
   post_build     : ECR push →（有効時のみ）Secrets 取得 → Antithesis へ push / 起動
```

## 脅威と対策（STRIDE 抜粋）
| 脅威 | 例 | 対策 |
| --- | --- | --- |
| 情報漏えい | ソースに仕込んだコードが API キーを読む | buildspec は infra 側に固定（ソース zip で変更不可）。キーは環境変数に置かず post_build で取得、ヘッダはファイル経由（argv に出さない）、一時ディレクトリは umask 077 で作成し trap で削除、終了時 docker logout |
| 情報漏えい | ローカルの鍵ファイルが upload される | `start-run.sh` は `git archive` で **コミット済みファイルのみ** をパッケージ。`.gitignore` に `*.key.json` 等 |
| 改ざん | start-build の環境変数上書きでコマンド注入 | buildspec 冒頭で全入力を正規表現で検証。JSON 本文は python で生成 |
| 改ざん | イメージの差し替え | ECR はタグ不変、タグはビルド番号 + 時刻で一意 |
| 権限昇格 | 特権モードからの脱出 | VPC なし（社内ネットワークに届かない）、ロールは対象リソースに限定、同時実行 1、キュー 2h / 実行 60 分のタイムアウト |
| 権限昇格 | GitHub の任意ブランチ / フォークからロール引受 | OIDC の `sub` を `repo:<owner>/<repo>:ref:refs/heads/<branch>`、`aud` を `sts.amazonaws.com` に固定。セッション 1 時間 |
| 否認 | 誰がいつ起動したか不明 | CloudTrail（アカウント標準）、S3 アクセスログ、ビルドログ、Antithesis 側に `custom.codebuild_build_id` |
| DoS / コスト | 大量起動 | 同時実行 1、Antithesis の duration は 1〜1440 分に制限 |
| サプライチェーン | 依存の改ざん | pip `--require-hashes`、npm は lockfile + `npm ci --ignore-scripts`、Actions は SHA 固定、ECR scan on push |

## 残存リスク（受容）
- 特権 CodeBuild 内では、ソース由来のコードが同じホスト上で動く。post_build 前に常駐プロセスを残されると
  理論上キーに到達し得る → **ソースバケットへの書き込み権限 = Antithesis キーへの間接アクセス** と扱い、
  書き込み主体を OIDC ロール（main ブランチ限定）と管理者に限定する。より強く分離する場合は
  「起動専用の別 CodeBuild プロジェクト（ソースなし）」へ分割する（Feedback Loop 候補）。
- `aws-cdk-lib` に同梱の `minimatch` に moderate の DoS 指摘（synth 時のみ使用、実行環境には載らない）。
  CI は `npm audit --audit-level=high` で判定。
- Antithesis のレジストリ認証方式（`_json_key`）は公式ドキュメント未確認（Q-05）。
