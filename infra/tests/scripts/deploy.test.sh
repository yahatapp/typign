#!/usr/bin/env sh
set -eu
INFRA_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
work_directory=$(mktemp -d "${TMPDIR:-/tmp}/typign-deploy-test.XXXXXX")
trap 'rm -rf "$work_directory"' 0
trap 'exit 130' INT
trap 'exit 143' TERM
fail() {
  printf 'not ok - %s\n' "$1" >&2
  cat "$case_directory/stderr" >&2
  exit 1
}
new_case() {
  case_directory="$work_directory/$1"
  mkdir -p "$case_directory/bin" "$case_directory/infra/scripts" "$case_directory/app/artifacts"
  cp "$INFRA_ROOT/scripts/deploy.sh" "$case_directory/infra/scripts/deploy.sh"
  cp "$INFRA_ROOT/.terraform-version" "$case_directory/infra/.terraform-version"
  printf 'test archive' >"$case_directory/app/artifacts/typign.zip"
  : >"$case_directory/commands"
  for command_name in aws terraform curl unzip; do
    ln -s "$INFRA_ROOT/tests/scripts/fixtures/command.sh" "$case_directory/bin/$command_name"
  done
  export TEST_ACCOUNT=123456789012 TEST_FAIL='' TF_TOKEN_app_terraform_io=test-token
  export PLAN_SHA256=''
}
run_stage() {
  exit_status=0
  (
    export PATH="$case_directory/bin:$PATH"
    export AWS_ACCOUNT_ID=123456789012 AWS_REGION=ap-northeast-1 TF_PLAN_PASSPHRASE=test-only-passphrase
    export GITHUB_REPOSITORY=yahatapp/typign PLAN_COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa PLAN_RUN_ID=123
    export TEST_LOG="$case_directory/commands" GITHUB_OUTPUT="$case_directory/output" GITHUB_STEP_SUMMARY="$case_directory/summary"
    sh "$case_directory/infra/scripts/deploy.sh" "$1"
  ) >"$case_directory/stdout" 2>"$case_directory/stderr" || exit_status=$?
  [ -z "$(find "$case_directory/infra" -name '.release.*' -print)" ] || fail 'Plaintext working directory was left behind.'
}
prepare_plan() {
  run_stage plan
  [ "$exit_status" -eq 0 ] || fail 'Plan failed.'
  if grep -Eq '^(curl|terraform.*[[:space:]]apply[[:space:]])' "$case_directory/commands"; then fail 'Plan performed deployment.'; fi
  export PLAN_SHA256
  PLAN_SHA256=$(jq -r .plan_sha256 "$case_directory/infra/artifacts/plan/metadata.json")
  grep -Fq "plan_sha256=$PLAN_SHA256" "$case_directory/output" || fail 'Plan hash was not exported as a job output.'
  : >"$case_directory/commands"
  rm -f "$case_directory/output" "$case_directory/summary"
}
no_apply() {
  [ "$exit_status" -ne 0 ] || fail 'Expected rejection.'
  if grep -Eq '[[:space:]]apply([[:space:]]|$)' "$case_directory/commands"; then fail 'Rejected plan reached apply.'; fi
}
printf '1..12\n'
new_case success
prepare_plan
run_stage apply
[ "$exit_status" -eq 0 ] || fail 'Apply failed.'
operations=$(awk -F '\t' '$1 == "terraform" {print $3}' "$case_directory/commands" | tr '\n' ' ')
[ "$operations" = 'init apply output output ' ] || fail 'Apply must use the saved plan without replanning.'
[ "$(grep -c '^curl' "$case_directory/commands")" -eq 2 ] || fail 'Missing HTTP verification.'
printf 'ok 1 - encrypts plan and applies the identical saved plan without replanning\n'

new_case wrong-account
export TEST_ACCOUNT=999999999999
run_stage plan
no_apply
[ "$(wc -l <"$case_directory/commands" | tr -d ' ')" -eq 1 ] || fail 'Wrong account reached another command.'
printf 'ok 2 - rejects wrong AWS account\n'
new_case missing-token
export TF_TOKEN_app_terraform_io=''
run_stage plan
no_apply
[ ! -s "$case_directory/commands" ] || fail 'Missing token reached commands.'
printf 'ok 3 - rejects missing Cloud token\n'
for failed_operation in init plan; do
  new_case "failed-$failed_operation"
  export TEST_FAIL="$failed_operation"
  run_stage plan
  no_apply
  [ ! -f "$case_directory/infra/artifacts/plan/release.tfplan.gpg" ] || fail 'Failed plan was published.'
  printf 'ok - stops after failed %s\n' "$failed_operation"
done
new_case wrong-hash
prepare_plan
export PLAN_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
run_stage apply
no_apply
printf 'ok 6 - rejects a hash different from the reviewed plan\n'
new_case wrong-archive
prepare_plan
printf 'different archive' >"$case_directory/app/artifacts/typign.zip"
run_stage apply
no_apply
printf 'ok 7 - rejects a different application artifact\n'
new_case expired
prepare_plan
metadata="$case_directory/infra/artifacts/plan/metadata.json"
jq '.created_at = 0' "$metadata" >"$metadata.tmp"
mv "$metadata.tmp" "$metadata"
run_stage apply
no_apply
printf 'ok 8 - rejects expired plans\n'
new_case tampered
prepare_plan
printf 'damaged ciphertext' >"$case_directory/infra/artifacts/plan/release.tfplan.gpg"
run_stage apply
no_apply
printf 'ok 9 - rejects damaged ciphertext\n'
new_case failed-apply
prepare_plan
export TEST_FAIL=apply
run_stage apply
[ "$exit_status" -ne 0 ] || fail 'Failed apply accepted.'
if grep -q '^curl' "$case_directory/commands"; then fail 'Failed apply reached HTTP.'; fi
printf 'ok 10 - stops after failed apply\n'
new_case failed-health
prepare_plan
export TEST_FAIL=health
run_stage apply
[ "$exit_status" -ne 0 ] || fail 'Failed health accepted.'
[ ! -f "$case_directory/output" ] || fail 'Failed health published URL.'
printf 'ok 11 - reports failed health verification\n'
new_case missing-mode
run_stage ''
no_apply
[ ! -s "$case_directory/commands" ] || fail 'Missing mode reached commands.'
printf 'ok 12 - requires an explicit plan or apply mode\n'
