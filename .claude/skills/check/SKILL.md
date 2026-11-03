---
name: check
description: Run MaesApp's quality gate — TypeScript typecheck, ESLint and Jest — and report failures with file:line. Use before calling a change done, and when the user asks to check, verify or test the code.
argument-hint: "[jest path or pattern]"
allowed-tools: Bash(npx tsc *), Bash(npm run lint *), Bash(npm test *), Bash(npx jest *)
---

Run all three steps from the repo root, even if an earlier one fails:

1. `npx tsc --noEmit`
2. `npm run lint`
3. Tests:
   - no arguments → `npm test -- --ci`
   - with arguments → `npx jest $ARGUMENTS --ci`

Then report a short table — step, pass/fail, error count — followed by each failure as `path:line — message`. Group repeated errors of the same kind.

If the user's task was to make something pass, fix the failures and re-run only the failing steps until green. Otherwise just report. Never "fix" a failure by deleting a test, adding `// @ts-ignore`, `eslint-disable` or `any` without saying so explicitly.

This gate does not build the native app. If the change touched `android/`, native dependencies or permissions, say that `/run-android` is still needed to verify it.
