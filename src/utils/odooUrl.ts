import { ODOO_ORIGIN } from '../config';

// Regex instead of `URL`: React Native's URL polyfill doesn't implement every accessor.
const HOST_RE = /^https?:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i;
const PATH_RE = /^https?:\/\/[^/?#]+(\/[^?#]*)?/i;

/** Lower-cased host of an http(s) URL, or `null` for anything else. */
export function hostOf(url: string): string | null {
  const match = HOST_RE.exec(url);
  return match ? match[1].toLowerCase() : null;
}

const ODOO_HOST = hostOf(ODOO_ORIGIN);

/** True for http(s) URLs on the Odoo server the app shows. */
export function isOdooUrl(url: string): boolean {
  return ODOO_HOST !== null && hostOf(url) === ODOO_HOST;
}

// Login, 2FA (/web/login/totp), sign-up and password reset.
const AUTH_PATHS = ['/web/login', '/web/signup', '/web/reset_password'];

/** True for Odoo's sign-in pages. */
export function isAuthPage(url: string): boolean {
  if (!isOdooUrl(url)) {
    return false;
  }
  const path = PATH_RE.exec(url)?.[1] ?? '/';
  return AUTH_PATHS.some(p => path === p || path.startsWith(`${p}/`));
}

// Odoo 19's Barcode app: its client action has path `barcode`, and its other
// actions `barcode-operations`, `barcode-batches`, `barcode-mo`. Screens opened
// from it nest under it (`/odoo/barcode/...`).
const BARCODE_APP_RE = /^\/odoo\/barcode(?:-[a-z]+)?(?:\/|$)/;

/** True while the Odoo Barcode app (or a screen opened from it) is shown. */
export function isBarcodeAppUrl(url: string): boolean {
  if (!isOdooUrl(url)) {
    return false;
  }
  return BARCODE_APP_RE.test(PATH_RE.exec(url)?.[1] ?? '/');
}
