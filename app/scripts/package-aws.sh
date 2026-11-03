#!/usr/bin/env sh
set -eu

APP_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
# shellcheck source=app/scripts/lib/package.sh
. "$APP_ROOT/scripts/lib/package.sh"
case "$*" in
'' | --offline) ;;
*)
  printf 'Usage: %s [--offline]\n' "$0" >&2
  exit 2
  ;;
esac

work_directory=$(mktemp -d "${TMPDIR:-/tmp}/typign-aws.XXXXXX")
pending=''
cleanup() {
  if [ -n "$pending" ]; then rm -f "$pending"; fi
  rm -rf "$work_directory"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM

stage_package "$work_directory/app" "$@"
(
  cd "$work_directory/app"
  zip -q -r "$work_directory/typign.zip" .
)
mkdir -p "$APP_ROOT/artifacts"
pending=$(mktemp "$APP_ROOT/artifacts/.typign.XXXXXX")
cp "$work_directory/typign.zip" "$pending"
artifact="$APP_ROOT/artifacts/typign.zip"
mv -f "$pending" "$artifact"
printf 'AWS package: %s\n' "$artifact"
sha256sum "$artifact"
