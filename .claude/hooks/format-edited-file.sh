#!/usr/bin/env bash
# PostToolUse hook: run prettier + eslint --fix on the JS/TS file Claude just edited.
# Never blocks the edit (always exits 0); /check is the real quality gate.

input=$(cat)
file_path=$(printf '%s' "$input" | node -e '
  let s = "";
  process.stdin.on("data", d => (s += d)).on("end", () => {
    try { process.stdout.write(JSON.parse(s).tool_input?.file_path || ""); } catch {}
  });
')

[ -z "$file_path" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

case "$file_path" in
  */node_modules/*|*/android/build/*|*/ios/Pods/*) exit 0 ;;
  *.ts|*.tsx|*.js|*.jsx)
    npx --no-install prettier --write --log-level warn "$file_path" >/dev/null 2>&1
    npx --no-install eslint --fix --quiet "$file_path" >/dev/null 2>&1
    ;;
esac
exit 0
