# Verification Gate 3: Construction → Operation

| チェック | 結果 |
| --- | --- |
| 全 Unit のコードが生成されている | ✅ U1 / U2 / U3 |
| FR の受け入れ基準がテストで確認されている | ✅ FR-06（スモーク 2 通り）、FR-08（モード切替テスト・本文生成）、FR-11（OIDC 信頼条件テスト）、FR-12（カスタムリソースなしテスト・cdkd synth） |
| NFR-SEC がテスト / 検査で確認されている | ✅ 暗号化・BPA・TLS・ECR 設定・シークレット非露出の jest、cdk-nag、bandit、npm audit |
| 既知の残存リスクが記録されている | ✅ security-design.md「残存リスク」 |
| 実環境での確認 | ⏳ 未実施（AWS 認証情報なし）→ runbook |
| 人の承認 | ⏳ 仮承認 |
