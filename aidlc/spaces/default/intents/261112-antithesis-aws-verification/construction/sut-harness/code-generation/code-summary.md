# U1 Code Generation Summary

| パス | 内容 |
| --- | --- |
| `sut/bank/app.py`, `Dockerfile` | SUT（標準ライブラリのみ、非 root、読み取り専用 FS で動作） |
| `sut/workload/` | ワークロード（SDK はハッシュ固定、非 root） |
| `sut/workload/test/v1/bank/` | Test Composer コマンド 5 本 |
| `sut/config/docker-compose.yaml`, `Dockerfile`, `.env` | Antithesis に渡す構成と config イメージ（`FROM scratch`） |
| `sut/config/docker-compose.local.yaml` | ローカル専用（SDK 出力先）。config イメージには含めない |
| `sut/tools/check_assertions.py` | SDK 出力の判定 |
| `scripts/local-smoke.sh` | 無料の事前検証ランナー（障害注入は SIGKILL で簡易再現） |

コンテナのハードニング: `cap_drop: [ALL]`, `no-new-privileges`, `read_only` + tmpfs, 固定 UID。
