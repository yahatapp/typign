#!/usr/bin/env sh
set -eu
: "${GITHUB_REPOSITORY:?Missing GITHUB_REPOSITORY}"
# Fail closed if the Environment is absent, unreadable, or has no required reviewer.
# Run before planning and again in the production job before AWS authentication.
environment=$(gh api "repos/$GITHUB_REPOSITORY/environments/production")
printf '%s' "$environment" | jq -e '
  .name == "production" and
  any(.protection_rules[]?; .type == "required_reviewers" and (.reviewers | length) > 0)
' >/dev/null || {
  echo 'Configure Settings → Environments → production → Required reviewers before deployment.' >&2
  exit 1
}
