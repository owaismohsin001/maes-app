import type { Brand } from './types';

/**
 * Castillo Valère — Odoo Online (SaaS, Odoo 19 Enterprise), one database, so
 * the login page needs no database choice. Built with `APP_BRAND=castillo`
 * (Android flavor `castillo`, `scripts/build-apk.sh castillo`).
 *
 * Logo: the black diamond with the "CV" cut-out over the "castillo valere"
 * wordmark (4× upscale of the client's 259×300 image, padded to 280×312 so
 * the loading ring around the diamond fits). The ring circles the diamond:
 * centre = the diamond's centre, radius just outside its corners.
 */
const brand: Brand = {
  key: 'castillo',
  appName: 'Castillo Scan',
  companyName: 'Castillo Valère',
  odooOrigin: 'https://castillo-valere.odoo.com',
  logo: {
    full: require('../assets/images/castillo_logo.png'),
    // Nothing to erase: the ring runs around the diamond, not through it.
    withoutRing: require('../assets/images/castillo_logo.png'),
    // The diamond alone, cropped to the ring's bounding square (1080×1080).
    mark: require('../assets/images/castillo_logo_mark.png'),
    size: { width: 280, height: 312 },
    ring: { cx: 140, cy: 136.5, rOuter: 135, stroke: 3 },
  },
};

export default brand;
