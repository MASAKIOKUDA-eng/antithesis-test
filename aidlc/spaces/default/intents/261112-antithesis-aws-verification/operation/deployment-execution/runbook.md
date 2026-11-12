# Runbook — cdkd によるデプロイと検証の実行

## 前提
- Node.js 22.12 以上、Docker（ローカルスモークを手元で回す場合）、AWS CLI v2
- 検証用 AWS アカウントの認証情報（`AWS_PROFILE` など）。本番アカウントは使わない

## 0. 一度だけ: cdkd bootstrap
```bash
cd infra && npm ci --ignore-scripts
npx cdkd bootstrap
```

## 1. デプロイ（Step 1/2: 無料の事前検証モード）
```bash
npx cdkd diff
npx cdkd deploy -O cdk-outputs.json \
  -c notificationEmail=you@example.com
```
- 通知メールの購読確認リンクを承認する
- GitHub から起動したい場合: `-c githubRepository=<owner>/<repo>`（既存 OIDC Provider があれば `-c githubOidcProviderArn=...`）

## 2. 実行
```bash
cd ..
./scripts/start-run.sh                                   # 正常版: build 成功が期待値
BANK_BUG_MODE=non_atomic_transfer WAIT=1 ./scripts/start-run.sh   # バグ版: スモークが「検出」して成功
```
ログは CloudWatch Logs `/aws/codebuild/antithesis-dev`。

## 3. Antithesis へ切り替え（Step 3: Teams / PoC 契約後）
1. Antithesis から受け取った値を **ファイル経由で** Secrets Manager に投入（シェル履歴に残さない）
   ```bash
   aws secretsmanager put-secret-value --secret-id antithesis-dev/registry-key --secret-string file://TENANT.key.json
   aws secretsmanager put-secret-value --secret-id antithesis-dev/api-key --secret-string file://api-key.txt
   shred -u TENANT.key.json api-key.txt   # 投入後は手元から削除
   ```
2. 設定を変えて再デプロイ
   ```bash
   cd infra && npx cdkd deploy -O cdk-outputs.json \
     -c antithesisEnabled=true -c antithesisTenant=<tenant> \
     -c antithesisRegistry=<Antithesis 発行のレジストリパス> \
     -c antithesisWebhook=basic_test -c antithesisDurationMinutes=30
   ```
3. `BANK_BUG_MODE=non_atomic_transfer ./scripts/start-run.sh` でバグ版を送り、トリアージレポートで
   「仕込んだバグが見つかるか / 再現性 / デバッグのしやすさ」を評価（解説資料の Step 3）

> 要確認（Q-05）: レジストリのパスと `_json_key` 方式は Antithesis の公式手順と照合してから使うこと。

## 4. 片付け
S3 バケットはバージョニング有効で、空でないと削除できない（カスタムリソースになる `autoDeleteObjects` は使っていない）。
ECR リポジトリは `EmptyOnDelete` で中身ごと削除される。
```bash
for b in <SourceBucketName> <AccessLogsBucketName>; do
  aws s3api list-object-versions --bucket "$b" --output json \
    --query '{Objects: [Versions, DeleteMarkers][][].{Key: Key, VersionId: VersionId}}' > /tmp/versions.json
  grep -q '"Key"' /tmp/versions.json && aws s3api delete-objects --bucket "$b" --delete file:///tmp/versions.json
done
cd infra && npx cdkd destroy
```
KMS キーは 7 日の削除待機期間を経て削除される。
