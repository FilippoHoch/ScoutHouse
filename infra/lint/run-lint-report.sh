#!/usr/bin/env bash
set -uo pipefail

OUTPUT_FILE=${OUTPUT_FILE:-/workspace/lint-warnings.txt}
TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$(dirname "$OUTPUT_FILE")"
: > "$OUTPUT_FILE"
{
  echo "# ScoutHouse lint warning report"
  echo ""
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  echo ""
} >> "$OUTPUT_FILE"

append_section() {
  local title="$1"
  local status="$2"
  local content_file="$3"

  {
    echo "## $title"
    echo ""
    if [ -s "$content_file" ]; then
      echo '```'
      cat "$content_file"
      echo '```'
    else
      echo "_No output._"
    fi
    if [ "$status" -ne 0 ]; then
      echo ""
      echo "_Command exited with status $status._"
    fi
    echo ""
  } >> "$OUTPUT_FILE"
}

run_and_capture() {
  local title="$1"
  shift

  local tmp_file
  tmp_file="$TMP_DIR/$(echo "$title" | tr ' ' '_' | tr '[:upper:]' '[:lower:]').log"
  if "$@" >"$tmp_file" 2>&1; then
    local exit_code=0
  else
    local exit_code=$?
  fi
  append_section "$title" "$exit_code" "$tmp_file"
}

log_step() {
  echo "[lint-report] $1"
}

log_step "Installing backend dependencies (editable with dev extras)..."
backend_install_file="$TMP_DIR/backend_install.log"
pushd /workspace/backend >/dev/null
if python -m pip install --no-cache-dir -e .[dev] >"$backend_install_file" 2>&1; then
  backend_status=0
else
  backend_status=$?
fi
popd >/dev/null
append_section "Backend dependency installation" "$backend_status" "$backend_install_file"

authors_file="$TMP_DIR/frontend_install.log"
log_step "Installing frontend dependencies with npm ci..."
pushd /workspace/frontend >/dev/null
if npm ci >"$authors_file" 2>&1; then
  frontend_status=0
else
  frontend_status=$?
fi
popd >/dev/null
append_section "Frontend dependency installation" "$frontend_status" "$authors_file"

log_step "Running linters and analyzers..."

pushd /workspace/backend >/dev/null
run_and_capture "Python - Ruff" python -m ruff check app tests
run_and_capture "Python - MyPy" python -m mypy app
run_and_capture "Python - Bandit" python -m bandit -r app
popd >/dev/null

pushd /workspace/frontend >/dev/null
run_and_capture "Frontend - ESLint" npm run lint -- --max-warnings=0
run_and_capture "Frontend - TypeScript" npm run typecheck
run_and_capture "Frontend - HTMLHint" npm run lint:html
popd >/dev/null

log_step "Lint warnings have been collected in $OUTPUT_FILE"
