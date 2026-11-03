/** The LIVE production server (odoo.maes-security.com → 16.16.235.235). */
export const ODOO_LIVE_ORIGIN = 'https://odoo.maes-security.com';

/** The client's TEST box (13.60.79.10): safe to scan, validate and count on. */
export const ODOO_TEST_ORIGIN = 'https://testing.maes-security.com';

/**
 * The Odoo server the app talks to (WebView and native screens). The TEST box
 * for now, at the user's request (2026-10-26), so scanning can be tried
 * without touching live stock. Switch to `ODOO_LIVE_ORIGIN` for go-live.
 */
export const ODOO_ORIGIN = ODOO_TEST_ORIGIN;

/**
 * Start page: the Odoo backend. Signed-in users land straight on their apps;
 * everyone else is redirected by Odoo to the login page (and back here after
 * signing in).
 */
export const ODOO_WEB_URL = `${ODOO_ORIGIN}/odoo`;
