#!/usr/bin/env bash
# Package the committed source, upload it to the source bucket and start the
# verification build in CodeBuild.
#
#   BANK_BUG_MODE=non_atomic_transfer ./scripts/start-run.sh
#
# Env vars:
#   SOURCE_BUCKET / PROJECT_NAME  use these instead of the outputs file (CI)
#   OUTPUTS_FILE   cdkd outputs JSON (default: infra/cdk-outputs.json, written by
#                  `cdkd deploy -O cdk-outputs.json`)
#   STACK_NAME     default: AntithesisVerification-${ENV_NAME:-dev}
#   BANK_BUG_MODE  none | non_atomic_transfer (overrides the deployed default)
#   ANTITHESIS_ENABLED  optional override: true | false
#   ANTITHESIS_RECIPIENTS  optional ';'-separated report recipients
#   WAIT           1 = wait for the build to finish and exit with its status
#   GIT_REF        commit to package (default: HEAD)
#
# Only files committed to git are packaged (git archive), so untracked local
# files such as a downloaded registry key can never be uploaded by accident.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NAME="${ENV_NAME:-dev}"
STACK_NAME="${STACK_NAME:-AntithesisVerification-${ENV_NAME}}"
OUTPUTS_FILE="${OUTPUTS_FILE:-${ROOT}/infra/cdk-outputs.json}"
GIT_REF="${GIT_REF:-HEAD}"
WAIT="${WAIT:-0}"

KEY="source/source.zip"
if [[ -n "${SOURCE_BUCKET:-}" && -n "${PROJECT_NAME:-}" ]]; then
  BUCKET="${SOURCE_BUCKET}"; PROJECT="${PROJECT_NAME}"
else
  [[ -f "${OUTPUTS_FILE}" ]] || { echo "outputs file not found: ${OUTPUTS_FILE} (run: cd infra && npx cdkd deploy -O cdk-outputs.json)" >&2; exit 2; }
  output() {
    python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]][sys.argv[3]])' "${OUTPUTS_FILE}" "${STACK_NAME}" "$1"
  }
  BUCKET="$(output SourceBucketName)"
  KEY="$(output SourceObjectKey)"
  PROJECT="$(output ProjectName)"
fi
[[ "${BUCKET}" =~ ^[a-z0-9.-]{3,63}$ && "${PROJECT}" =~ ^[A-Za-z0-9_-]{2,255}$ ]] || { echo "invalid bucket/project name" >&2; exit 2; }

overrides=()
if [[ -n "${BANK_BUG_MODE:-}" ]]; then
  [[ "${BANK_BUG_MODE}" =~ ^(none|non_atomic_transfer)$ ]] || { echo "invalid BANK_BUG_MODE" >&2; exit 2; }
  overrides+=("name=BANK_BUG_MODE,value=${BANK_BUG_MODE},type=PLAINTEXT")
fi
if [[ -n "${ANTITHESIS_ENABLED:-}" ]]; then
  [[ "${ANTITHESIS_ENABLED}" =~ ^(true|false)$ ]] || { echo "invalid ANTITHESIS_ENABLED" >&2; exit 2; }
  overrides+=("name=ANTITHESIS_ENABLED,value=${ANTITHESIS_ENABLED},type=PLAINTEXT")
fi
if [[ -n "${ANTITHESIS_RECIPIENTS:-}" ]]; then
  [[ "${ANTITHESIS_RECIPIENTS}" =~ ^[A-Za-z0-9._%+@\;-]{3,512}$ ]] || { echo "invalid ANTITHESIS_RECIPIENTS" >&2; exit 2; }
  overrides+=("name=ANTITHESIS_RECIPIENTS,value=${ANTITHESIS_RECIPIENTS},type=PLAINTEXT")
fi
SOURCE_LABEL="$(git -C "${ROOT}" rev-parse --short "${GIT_REF}")"
overrides+=("name=SOURCE_LABEL,value=git-${SOURCE_LABEL},type=PLAINTEXT")

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
git -C "${ROOT}" archive --format=zip -o "${WORK}/source.zip" "${GIT_REF}" sut scripts
echo "==> uploading ${GIT_REF} (${SOURCE_LABEL}) to s3://${BUCKET}/${KEY}"
aws s3 cp "${WORK}/source.zip" "s3://${BUCKET}/${KEY}" --only-show-errors

echo "==> starting CodeBuild project ${PROJECT}"
BUILD_ID="$(aws codebuild start-build --project-name "${PROJECT}" \
  --environment-variables-override "${overrides[@]}" \
  --query 'build.id' --output text)"
echo "build: ${BUILD_ID}"

if [[ "${WAIT}" == "1" ]]; then
  while :; do
    STATUS="$(aws codebuild batch-get-builds --ids "${BUILD_ID}" --query 'builds[0].buildStatus' --output text)"
    [[ "${STATUS}" != "IN_PROGRESS" ]] && break
    sleep 20
  done
  echo "status: ${STATUS}"
  [[ "${STATUS}" == "SUCCEEDED" ]]
fi
