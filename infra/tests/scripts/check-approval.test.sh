#!/usr/bin/env sh
set -eu
INFRA_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
work_directory=$(mktemp -d "${TMPDIR:-/tmp}/typign-approval-test.XXXXXX")
trap 'rm -rf "$work_directory"' 0
mkdir "$work_directory/bin"
cat >"$work_directory/bin/gh" <<'MOCK'
#!/usr/bin/env sh
[ "$*" = "api repos/yahatapp/typign/environments/production" ] || exit 2
[ "$TEST_API_FAIL" = false ] || exit 1
cat "$TEST_ENVIRONMENT"
MOCK
chmod +x "$work_directory/bin/gh"
export PATH="$work_directory/bin:$PATH" TEST_ENVIRONMENT="$work_directory/environment.json"
export GITHUB_REPOSITORY=yahatapp/typign TEST_API_FAIL=false
printf '%s\n' '{"name":"production","protection_rules":[{"type":"required_reviewers","reviewers":[{"type":"User","reviewer":{"id":1}}]}]}' >"$work_directory/valid.json"
cp "$work_directory/valid.json" "$TEST_ENVIRONMENT"
printf '1..6\n'
sh "$INFRA_ROOT/scripts/check-approval.sh"
printf 'ok 1 - accepts required reviewer protection on production\n'
for expression in '.protection_rules=[]' '.protection_rules[0].reviewers=[]' '.protection_rules[0].type="wait_timer"' '.name="production-plan"'; do
  jq "$expression" "$work_directory/valid.json" >"$TEST_ENVIRONMENT"
  if sh "$INFRA_ROOT/scripts/check-approval.sh" >"$work_directory/stdout" 2>"$work_directory/stderr"; then
    printf 'not ok - accepted %s\n' "$expression" >&2
    exit 1
  fi
  grep -q 'Required reviewers' "$work_directory/stderr"
  printf 'ok - rejects %s\n' "$expression"
done
cp "$work_directory/valid.json" "$TEST_ENVIRONMENT"
export TEST_API_FAIL=true
if sh "$INFRA_ROOT/scripts/check-approval.sh"; then exit 1; fi
printf 'ok 6 - rejects unreadable or missing Environment\n'
