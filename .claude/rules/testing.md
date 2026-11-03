---
paths:
  - "__tests__/**"
  - "**/*.test.{ts,tsx}"
  - "jest.config.js"
  - "jest.setup.*"
---

# Tests

- Jest with `@react-native/jest-preset`. Run one file with `npx jest <path>`, one test with `npx jest -t "<name>"`.
- `react-test-renderer` (used by the template test) is deprecated as of React 19. For new component tests prefer `@testing-library/react-native` — it isn't installed yet, so ask before adding it and record the choice in `.claude/memory/decisions.md`.
- Native modules (camera/scanner, secure storage, etc.) don't exist in Jest: mock them once in a shared setup file referenced from `jest.config.js` (`setupFiles`), not ad hoc in each test.
- Test the Odoo layer (`src/api/`) by mocking `fetch` with recorded-shape responses. Unit tests never call the test or live server.
- **Fixtures must be synthetic** — invented names, addresses, serials and barcodes. Never paste rows from the Odoo DB, even from the test box (it is a copy of production data; contractual).
- Cover the Odoo quirks explicitly: `false` for empty fields, many2one values, UTC datetime strings, a barcode with no match falling back to `default_code`.
