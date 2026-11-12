# Units of Work

| Unit | 目的 | 成果物 | 依存 |
| --- | --- | --- | --- |
| U1 sut-harness | Antithesis に渡す「テストの形」（SUT・ワークロード・Compose・ローカル判定） | `sut/`, `scripts/local-smoke.sh` | なし |
| U2 aws-pipeline | U1 を AWS 上で build / 事前検証 / push / 起動する基盤（CDK, cdkd） | `infra/` | U1（ディレクトリ構成と smoke スクリプト） |
| U3 ci-integration | GitHub からの静的検査・スモーク・手動起動 | `.github/workflows/`, `scripts/start-run.sh` | U1, U2（出力値） |

実行順: U1 → U2 → U3（unit-major）。U1 を先に作り、ローカルで pass/fail が判定できることを確認してから
AWS に載せることで、AWS 側の不具合と SUT 側の不具合を切り分けられるようにした。
