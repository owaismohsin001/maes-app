/**
 * Server origins shared by several brand files. A brand file can't import
 * another brand file: Metro swaps `index.ts` for the active brand, so an
 * import of `./index` from `castillo.ts` would resolve to itself.
 */

/** The LIVE production server of MAES (odoo.maes-security.com → 16.16.235.235). */
export const MAES_LIVE_ORIGIN = 'https://odoo.maes-security.com';

/** The client's TEST box (13.60.79.10): safe to scan, validate and count on. */
export const MAES_TEST_ORIGIN = 'https://testing.maes-security.com';
