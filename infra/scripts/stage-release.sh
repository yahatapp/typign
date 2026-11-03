#!/usr/bin/env sh
set -eu
# CodeBuild gives each job a different source path. Saved Terraform plans need
# the same absolute configuration and artifact paths in both runner containers.
REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
mkdir /tmp/typign-release
cp -R "$REPO_ROOT/app" "$REPO_ROOT/infra" /tmp/typign-release/
