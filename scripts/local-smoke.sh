#!/usr/bin/env bash
# Local (free) pre-verification of the Antithesis test harness.
#
# Emulates what Antithesis does, crudely and non-deterministically:
#   bring up the compose topology -> wait for setup_complete ->
#   first_ -> parallel_driver_ x N with anytime_ checks and crash faults ->
#   singleton_driver_ -> eventually_ -> judge the SDK assertion output.
#
# It is NOT a substitute for Antithesis (no deterministic hypervisor, no
# guided exploration), but it proves the images, the compose file, the
# Test Composer commands and the assertions are wired correctly before you
# spend Antithesis compute hours.
#
# Env vars:
#   IMAGE_REGISTRY  image name prefix            (default: local)
#   IMAGE_TAG       image tag                    (default: dev)
#   BANK_BUG_MODE   none | non_atomic_transfer   (default: none)
#   EXPECT          pass | fail                  (default: pass if BANK_BUG_MODE=none, else fail)
#   ROUNDS          driver rounds                (default: 3)
#   PARALLEL        concurrent parallel drivers  (default: 4)
#   FAULTS          1 = SIGKILL the bank between rounds (default: 1)
#   SKIP_BUILD      1 = use already-built images (default: 0)
#   OUTPUT_DIR      where sdk.jsonl is copied    (default: ./smoke-output)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-local}"
IMAGE_TAG="${IMAGE_TAG:-dev}"
BANK_BUG_MODE="${BANK_BUG_MODE:-none}"
if [[ "${BANK_BUG_MODE}" == "none" ]]; then EXPECT="${EXPECT:-pass}"; else EXPECT="${EXPECT:-fail}"; fi
ROUNDS="${ROUNDS:-3}"
PARALLEL="${PARALLEL:-4}"
FAULTS="${FAULTS:-1}"
SKIP_BUILD="${SKIP_BUILD:-0}"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT}/smoke-output}"
TEST_DIR=/opt/antithesis/test/v1/bank

case "${BANK_BUG_MODE}" in none|non_atomic_transfer) ;; *) echo "invalid BANK_BUG_MODE" >&2; exit 2;; esac
case "${EXPECT}" in pass|fail) ;; *) echo "invalid EXPECT" >&2; exit 2;; esac
[[ "${ROUNDS}" =~ ^[0-9]+$ && "${PARALLEL}" =~ ^[0-9]+$ ]] || { echo "ROUNDS/PARALLEL must be integers" >&2; exit 2; }

WORK="$(mktemp -d)"
ENV_FILE="${WORK}/smoke.env"
cat > "${ENV_FILE}" <<EOF
IMAGE_REGISTRY=${IMAGE_REGISTRY}
IMAGE_TAG=${IMAGE_TAG}
BANK_BUG_MODE=${BANK_BUG_MODE}
EOF

PROJECT="antithesis-smoke-$$"
compose() {
  docker compose --project-name "${PROJECT}" --env-file "${ENV_FILE}" \
    -f "${ROOT}/sut/config/docker-compose.yaml" \
    -f "${ROOT}/sut/config/docker-compose.local.yaml" "$@"
}
cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

if [[ "${SKIP_BUILD}" != "1" ]]; then
  echo "==> building images (${IMAGE_REGISTRY}/*:${IMAGE_TAG})"
  docker build --platform linux/amd64 -t "${IMAGE_REGISTRY}/antithesis-bank:${IMAGE_TAG}" "${ROOT}/sut/bank"
  docker build --platform linux/amd64 -t "${IMAGE_REGISTRY}/antithesis-workload:${IMAGE_TAG}" "${ROOT}/sut/workload"
fi

echo "==> starting topology (bug mode: ${BANK_BUG_MODE}, expect: ${EXPECT})"
compose up -d --no-build

echo "==> waiting for setup_complete"
for _ in $(seq 1 60); do
  if compose logs workload 2>/dev/null | grep -q "setup complete"; then break; fi
  sleep 2
done
compose logs workload | grep -q "setup complete" || { compose logs; echo "setup never completed" >&2; exit 1; }

run() { compose exec -T workload "${TEST_DIR}/$1" >/dev/null 2>&1 || true; }

echo "==> first_"
run first_seed_accounts.py

for round in $(seq 1 "${ROUNDS}"); do
  echo "==> round ${round}/${ROUNDS}: ${PARALLEL} x parallel_driver_ + anytime_"
  pids=()
  for _ in $(seq 1 "${PARALLEL}"); do run parallel_driver_transfer.py & pids+=($!); done
  for _ in $(seq 1 5); do run anytime_check_conservation.py; done
  if [[ "${FAULTS}" == "1" ]]; then
    echo "    fault: SIGKILL bank, then restart"
    compose kill -s SIGKILL bank >/dev/null 2>&1 || true
    sleep 1
    compose start bank >/dev/null 2>&1 || true
  fi
  wait "${pids[@]}" || true
  run anytime_check_conservation.py
done

echo "==> singleton_driver_"
run singleton_driver_integration.py

echo "==> eventually_"
run eventually_check_recovery.py

mkdir -p "${OUTPUT_DIR}"
compose cp workload:/sdk-output/sdk.jsonl "${OUTPUT_DIR}/sdk.jsonl" >/dev/null
echo "==> judging assertions (${OUTPUT_DIR}/sdk.jsonl)"
python3 "${ROOT}/sut/tools/check_assertions.py" "${OUTPUT_DIR}/sdk.jsonl" --expect "${EXPECT}"
