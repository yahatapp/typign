#!/usr/bin/env sh
set -eu
umask 077
die() {
  printf '%s\n' "$1" >&2
  exit 1
}

mode=${1:?Usage: deploy.sh plan|apply}
case "$mode" in plan | apply) ;; *) exit 2 ;; esac
: "${AWS_ACCOUNT_ID:?Missing AWS_ACCOUNT_ID}"
: "${AWS_REGION:?Missing AWS_REGION}"
: "${TF_TOKEN_app_terraform_io:?Missing TF_TOKEN_app_terraform_io}"
: "${TF_PLAN_PASSPHRASE:?Missing TF_PLAN_PASSPHRASE}"
: "${GITHUB_REPOSITORY:?Missing GITHUB_REPOSITORY}"
: "${PLAN_COMMIT:?Missing PLAN_COMMIT}"
: "${PLAN_RUN_ID:?Missing PLAN_RUN_ID}"
INFRA_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$INFRA_ROOT"
artifact_directory="$INFRA_ROOT/artifacts/plan"
work_directory=$(mktemp -d "$INFRA_ROOT/.release.XXXXXX")
gpg_directory=$(mktemp -d /tmp/typign-gpg.XXXXXX)
cleanup() {
  gpgconf --homedir "$gpg_directory" --kill gpg-agent >/dev/null 2>&1 || :
  rm -rf "$work_directory" "$gpg_directory"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
export GNUPGHOME="$gpg_directory"
plan="$work_directory/release.tfplan"
metadata="$artifact_directory/metadata.json"
archive=../app/artifacts/typign.zip
hash_file() { sha256sum "$1" | cut -d ' ' -f 1; }
[ "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID" ] || die 'AWS account does not match AWS_ACCOUNT_ID.'
test -s "$archive"
unzip -tq "$archive"

if [ "$mode" = apply ]; then
  : "${PLAN_SHA256:?Missing Plan job output PLAN_SHA256}"
  printf '%s\n' "$PLAN_SHA256" | grep -Eq '^[0-9a-f]{64}$'
  # Authenticate/decrypt before Terraform reads the saved plan. Never create a new plan here.
  printf '%s' "$TF_PLAN_PASSPHRASE" | gpg --batch --quiet --pinentry-mode loopback \
    --passphrase-fd 0 --output "$plan" --decrypt "$artifact_directory/release.tfplan.gpg"
  [ "$(hash_file "$plan")" = "$PLAN_SHA256" ] || die 'Saved plan SHA256 does not match the Plan job SHA256.'
  jq -e --arg commit "$PLAN_COMMIT" --arg run "$PLAN_RUN_ID" \
    --arg repo "$GITHUB_REPOSITORY" --arg hash "$PLAN_SHA256" \
    --arg archive "$(hash_file "$archive")" --arg version "$(cat .terraform-version)" \
    --argjson now "$(date +%s)" '
      .commit == $commit and .run_id == $run and .repository == $repo and
      .plan_sha256 == $hash and .archive_sha256 == $archive and
      .terraform_version == $version and
      (.created_at <= $now and .created_at >= ($now - 86400))
    ' "$metadata" >/dev/null || die 'Plan metadata, ZIP, Terraform version or 24-hour validity does not match.'
fi

# Terraform Cloud stores/locks state; both stages execute locally on the runner.
terraform -chdir="$INFRA_ROOT" init -input=false -lockfile=readonly
if [ "$mode" = plan ]; then
  mkdir -p "$artifact_directory"
  terraform -chdir="$INFRA_ROOT" plan -input=false -lock-timeout=5m -out="$plan"
  terraform -chdir="$INFRA_ROOT" show -no-color "$plan" >"$artifact_directory/review.txt"
  plan_hash=$(hash_file "$plan")
  jq -n --arg commit "$PLAN_COMMIT" --arg run "$PLAN_RUN_ID" \
    --arg repo "$GITHUB_REPOSITORY" --arg hash "$plan_hash" \
    --arg archive "$(hash_file "$archive")" --arg version "$(cat .terraform-version)" \
    --argjson now "$(date +%s)" \
    '{commit:$commit,run_id:$run,repository:$repo,plan_sha256:$hash,archive_sha256:$archive,terraform_version:$version,created_at:$now}' >"$metadata"
  printf '%s' "$TF_PLAN_PASSPHRASE" | gpg --batch --quiet --pinentry-mode loopback \
    --passphrase-fd 0 --symmetric --cipher-algo AES256 \
    --output "$artifact_directory/release.tfplan.gpg" "$plan"
  printf '\nCommit: %s\nPlan run ID: %s\nPlan SHA256: %s\n' "$PLAN_COMMIT" "$PLAN_RUN_ID" "$plan_hash" >>"$artifact_directory/review.txt"
  cat "$artifact_directory/review.txt"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf 'Plan ready for review.\n\nCommit: %s\nPlan run ID: %s\nPlan SHA256: %s\n' \
      "$PLAN_COMMIT" "$PLAN_RUN_ID" "$plan_hash" >>"$GITHUB_STEP_SUMMARY"
  fi
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'plan_sha256=%s\n' "$plan_hash" >>"$GITHUB_OUTPUT"
  fi
  exit 0
fi

terraform -chdir="$INFRA_ROOT" apply -input=false -lock-timeout=5m "$plan"
url=$(terraform -chdir="$INFRA_ROOT" output -raw url)
health_url=$(terraform -chdir="$INFRA_ROOT" output -raw health_url)
case "$url" in https://*) ;; *) exit 1 ;; esac
[ "$health_url" = "$url/health" ]
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 5 \
  --connect-timeout 10 --max-time 30 "$health_url"
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 5 \
  --connect-timeout 10 --max-time 30 --output /dev/null "$url/"
if [ -n "${GITHUB_OUTPUT:-}" ]; then printf 'url=%s\n' "$url" >>"$GITHUB_OUTPUT"; fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf 'Applied reviewed plan from run %s, commit %s: %s\n' "$PLAN_RUN_ID" "$PLAN_COMMIT" "$url" >>"$GITHUB_STEP_SUMMARY"
fi
