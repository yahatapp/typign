#!/usr/bin/env sh
set -eu

command_name=${0##*/}
{
  printf '%s' "$command_name"
  printf '\t%s' "$@"
  printf '\n'
} >>"$TEST_LOG"
case "$command_name" in
aws) printf '%s\n' "$TEST_ACCOUNT" ;;
terraform)
  operation=''
  plan_path=''
  last_argument=''
  for argument; do
    case "$argument" in
    init | plan | apply | output | show) operation=$argument ;;
    -out=*) plan_path=${argument#-out=} ;;
    esac
    last_argument=$argument
  done
  case "$operation" in
  init) [ "$TEST_FAIL" != init ] ;;
  plan)
    printf 'saved plan' >"$plan_path"
    [ "$TEST_FAIL" != plan ]
    ;;
  show) printf 'Plan: 1 to add, 0 to change, 0 to destroy.\n' ;;
  apply)
    [ "$(cat "$last_argument")" = 'saved plan' ]
    [ "$TEST_FAIL" != apply ]
    ;;
  output)
    case "$last_argument" in
    health_url) printf 'https://typign.example.invalid/health\n' ;;
    url) printf 'https://typign.example.invalid\n' ;;
    *) exit 2 ;;
    esac
    ;;
  *) exit 2 ;;
  esac
  ;;
curl) [ "$TEST_FAIL" != health ] ;;
date)
  [ "$*" = '+%s' ] || exit 2
  printf '%s\n' "$TEST_NOW"
  ;;
unzip) : ;;
*) exit 2 ;;
esac
