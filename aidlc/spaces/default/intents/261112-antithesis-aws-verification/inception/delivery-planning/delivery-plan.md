# Delivery Plan

## 検証の段階（解説資料の「検証を進める順番」との対応）
| 段階 | 内容 | 設定 | 費用 |
| --- | --- | --- | --- |
| Step 1 無料の事前検証 | AWS 上で build + ローカルスモーク + ECR push | 既定（`antithesisEnabled=false`, `bankBugMode=none`） | CodeBuild 従量のみ |
| Step 2 バグを仕込む | 同じパイプラインでバグ版を流し「検出される」ことを確認 | 起動時に `BANK_BUG_MODE=non_atomic_transfer` | 同上 |
| Step 3 Teams / PoC | Antithesis レジストリへ push + `launch_experiment` | `antithesisEnabled=true` + テナント / レジストリ + シークレット | Antithesis 契約 |

## マイルストーン
1. U1 完成・ローカルで pass/fail 判定 ✅
2. U2 完成・synth / cdk-nag / unit test ✅
3. U3 完成・CI 定義 ✅
4. 実 AWS へ `cdkd deploy` → Step 1, 2 を実行（要: AWS 認証情報）
5. 契約後に Step 3（要: Antithesis テナント）
