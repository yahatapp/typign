#!/usr/bin/env sh
set -eu

APP_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
# shellcheck source=app/scripts/lib/package.sh
. "$APP_ROOT/scripts/lib/package.sh"
work_directory=$(mktemp -d "${TMPDIR:-/tmp}/typign-package-test.XXXXXX")
server_pid=''
cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || :
    wait "$server_pid" 2>/dev/null || :
  fi
  rm -rf "$work_directory"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
fail() {
  printf '%s\n' "$1" >&2
  cat "$work_directory/server.log" >&2
  exit 1
}

stage_package "$work_directory/app" --offline
# The server chooses a free port, then reports the actual address in its log.
(
  cd "$work_directory/app"
  exec env AWS_LAMBDA_HTTP_ENDPOINT=127.0.0.1:0 NODE_ENV=development node index.js
) >"$work_directory/server.log" 2>&1 &
server_pid=$!
base=''
attempt=0
while [ "$attempt" -lt 100 ]; do
  kill -0 "$server_pid" 2>/dev/null || fail 'Production package exited before startup.'
  base=$(sed -n 's/^Typign \(http:\/\/127\.0\.0\.1:[0-9][0-9]*\)$/\1/p' "$work_directory/server.log" | head -n 1)
  if [ -n "$base" ] && curl --fail --silent --max-time 1 "$base/health" >"$work_directory/health.json"; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done
[ "$attempt" -lt 100 ] || fail 'Production package did not become healthy in ten seconds.'
jq -e '.status == "ok"' "$work_directory/health.json" >/dev/null

curl --fail --silent --show-error --max-time 10 -D "$work_directory/headers" -o "$work_directory/index.html" "$base/"
grep -q typign "$work_directory/index.html"
tr -d '\r' <"$work_directory/headers" | grep -Eiq '^cache-control: no-store$'
grep -Eo '(href|src)="/assets/[^"]+"' "$work_directory/index.html" |
  sed 's/^[^"]*"//;s/"$//' | sort -u >"$work_directory/assets"
[ -s "$work_directory/assets" ] || fail 'SSR did not include static assets.'
while IFS= read -r asset; do
  curl --fail --silent --show-error --max-time 10 -D "$work_directory/headers" -o /dev/null "$base$asset"
  grep -Eiq '^cache-control:.*immutable' "$work_directory/headers"
done <"$work_directory/assets"
curl --fail --silent --show-error --max-time 10 -D "$work_directory/headers" -o /dev/null "$base/_rsc?path=/analysis"
grep -Eiq '^content-type:.*text/x-component' "$work_directory/headers"
status_code=$(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}' "$base/missing")
[ "$status_code" = 404 ] || fail "Expected 404, got $status_code."
printf 'Isolated production package passed: health, HTML, Flight, static assets, 404.\n'
