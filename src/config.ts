import brand from './brand';

export type { Brand } from './brand/types';

/**
 * The brand this build was made for (`APP_BRAND` at build time: `maes` by
 * default, `castillo` for Castillo Valère). Everything customer-specific —
 * server, app name — comes from here; see `src/brand/`.
 */
export const BRAND = brand;

/**
 * The Odoo server the app talks to (WebView and scanner relay): the brand's
 * server. For MAES this is the TEST box unless `src/brand/index.ts` says
 * otherwise.
 */
export const ODOO_ORIGIN = BRAND.odooOrigin;

/**
 * Start page: the Odoo backend. Signed-in users land straight on their apps;
 * everyone else is redirected by Odoo to the login page (and back here after
 * signing in).
 */
export const ODOO_WEB_URL = `${ODOO_ORIGIN}/odoo`;

/**
 * Shown on the scanner settings screen so a screenshot tells which build the
 * handheld runs. Keep in step with `versionName` in android/app/build.gradle.
 */
export const APP_VERSION = '1.4';
