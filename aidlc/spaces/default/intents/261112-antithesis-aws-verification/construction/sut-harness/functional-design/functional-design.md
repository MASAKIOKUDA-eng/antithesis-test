# U1 sut-harness — Functional Design

## SUT: 送金台帳サービス（`sut/bank/app.py`）
| API | 説明 |
| --- | --- |
| `GET /health` | 生存確認（bug_mode も返す） |
| `GET /snapshot` | 1 つの読み取りトランザクションで全口座と合計を返す |
| `POST /accounts {id, balance}` | 冪等な口座作成 |
| `POST /transfer {from, to, amount}` | 送金。200 / 409（残高不足）/ 404 / 400 / 503 |

- 永続化: SQLite（WAL, synchronous=FULL）。コンテナの SIGKILL 後もデータが残る
- 入力検証: 口座 ID は `^[a-z0-9_-]{1,32}$`、金額は 1〜1,000,000 の整数（bool 拒否）、本文 4KB 上限、
  Content-Type 必須。内部エラーの詳細は返さない

### プロパティ
- **保存則**: `total == count × INITIAL_BALANCE`（送金はお金を移すだけ）
- **非負**: 全残高 ≥ 0
- **回復性**: 障害が止んだ後、サービスは応答し保存則を満たす

### 仕込みバグ `non_atomic_transfer`
引き落としと入金を別トランザクションで commit し、その間に 5ms 待つ。
- 並行する `/snapshot` が「引き落とし済み・入金前」の状態を観測 → 保存則違反
- その間にプロセスが落ちる → お金が永久に消える（Antithesis の障害注入で狙う典型）

## ワークロード（Test Composer: `/opt/antithesis/test/v1/bank/`）
| コマンド | 役割 | 主なアサーション |
| --- | --- | --- |
| `first_seed_accounts.py` | 口座作成 | always: 作成は 200/201、reachable: 完了 |
| `parallel_driver_transfer.py` | ランダム送金（`antithesis.random` で選択を Antithesis 制御下に） | always: 想定内のステータス、sometimes: 成功 / 残高不足 / ネットワーク障害 |
| `singleton_driver_integration.py` | 既存の結合テスト相当（資料推奨の入口） | always: 送金額ぴったり移動 |
| `anytime_check_conservation.py` | 障害注入中の不変条件 | always: 保存則・非負、sometimes: 全口座を観測 |
| `eventually_check_recovery.py` | 障害停止後の回復 | always: 回復・読み取り可・保存則 |

`entrypoint.py` は SUT が healthy になってから `setup_complete` を出し、以降は待機
（Test Composer がコマンドを exec する）。

## ローカル判定（`sut/tools/check_assertions.py`）
SDK 0.4.1 は `ANTITHESIS_SDK_LOCAL_OUTPUT` 指定時に JSONL を書く。これをトリアージレポート風に判定:
always が 1 回でも false → FAIL、sometimes が一度も true にならない → WARN、unreachable に到達 → FAIL。
`--expect fail` でバグ版が「検出される」ことを合格条件にできる。
