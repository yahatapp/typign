#!/usr/bin/env sh
# Shared staging for AWS archives and isolated production-package tests.
: "${APP_ROOT:?Set APP_ROOT before sourcing package.sh}"

stage_package() {
  target=$1
  shift
  mkdir -p "$target" || return
  for entry in index.js package.json pnpm-lock.yaml NOTICE rsc ssr client; do
    cp -R "$APP_ROOT/dist/$entry" "$target/" || return
  done
  # Keep every dependency inside the package instead of linking to a pnpm store.
  printf 'nodeLinker: hoisted\n' >"$target/pnpm-workspace.yaml" || return
  (
    cd "$target" || exit
    pnpm install --prod --frozen-lockfile "$@"
  )
}
