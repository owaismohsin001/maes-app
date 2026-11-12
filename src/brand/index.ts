import { MAES_LIVE_ORIGIN, MAES_TEST_ORIGIN } from './servers';
import type { Brand } from './types';

/** The LIVE production server (odoo.maes-security.com → 16.16.235.235). */
export const ODOO_LIVE_ORIGIN = MAES_LIVE_ORIGIN;

/** The client's TEST box (13.60.79.10): safe to scan, validate and count on. */
export const ODOO_TEST_ORIGIN = MAES_TEST_ORIGIN;

/**
 * MAES Security — the default brand (`APP_BRAND` unset or `maes`).
 *
 * The LIVE server since 2026-11-03 (field rollout on the handheld); it was the
 * TEST box before, so scanning could be tried without touching live stock.
 *
 * Logo measurements are in px of the original 268×160 `maes_logo.png`; the
 * ring is the one around the "M" (measured from the file).
 */
const brand: Brand = {
  key: 'maes',
  appName: 'MaesApp',
  companyName: 'MAES Security',
  // LIVE since 2026-11-03 at the user's request (field rollout on the handheld).
  odooOrigin: ODOO_LIVE_ORIGIN,
  // Devices, the on/off switch and the allowed place live in this Odoo
  // (Inventory > Configuration > Scan app).
  controlOrigin: ODOO_LIVE_ORIGIN,
  logo: {
    full: require('../assets/images/maes_logo.png'),
    // 4× upscale of the original with the ring around the "M" erased.
    withoutRing: require('../assets/images/maes_logo_mark.png'),
    // Only the "M", cropped to the ring's bounding square (ring erased, 441×441).
    mark: require('../assets/images/maes_logo_m.png'),
    size: { width: 268, height: 160 },
    ring: { cx: 56.35, cy: 56.15, rOuter: 55.13, stroke: 2.75 },
  },
};

export default brand;
