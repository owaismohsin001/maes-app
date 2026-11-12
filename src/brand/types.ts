import type { ImageSourcePropType } from 'react-native';

/**
 * The brand's logo, as drawn by the splash screen, `LogoSpinner`, the home
 * screen: ink on transparent (so `tintColor` works), plus the geometry of the
 * ring that spins while loading. Measurements are in px of `size`.
 */
export type BrandLogo = {
  /** The complete logo, for static use (home screen, headers). */
  full: ImageSourcePropType;
  /**
   * The complete logo with the loading ring's own place left empty (MAES:
   * the ring around the "M" erased). The ring is drawn at `ring`.
   */
  withoutRing: ImageSourcePropType;
  /**
   * Only the mark, cropped to the ring's bounding square: its ring is the
   * whole square (offset 0, diameter = rendered size).
   */
  mark: ImageSourcePropType;
  /** Size of `full` / `withoutRing`, in source px. */
  size: { width: number; height: number };
  /** Centre, outer radius and stroke of the loading ring, in source px. */
  ring: { cx: number; cy: number; rOuter: number; stroke: number };
};

/**
 * One customer's build of the scan app: the Odoo server it talks to and the
 * name and logo it carries. The active brand is chosen at BUILD time with the
 * `APP_BRAND` environment variable (see `metro.config.js`, `jest.config.js`
 * and `android/app/build.gradle`); the code never switches brands at runtime.
 * The launcher icon is the Android flavor's `res/mipmap-*` (main = MAES,
 * `android/app/src/<brand>/res` overrides it).
 */
export type Brand = {
  /** Short key, also the Android product flavor: `maes`, `castillo`. */
  key: string;
  /** Launcher label (also `app_name` of the matching Android flavor). */
  appName: string;
  /** The customer, for accessibility labels and texts. */
  companyName: string;
  /** Odoo server origin (scheme + host, no trailing slash). */
  odooOrigin: string;
  /**
   * The Odoo server that decides whether the app may run on this device
   * (`POST /maes_app/check`, odoo19Module §P450): device allowed / blocked,
   * app switched on, at the allowed place. MAES's Odoo for every brand.
   */
  controlOrigin: string;
  logo: BrandLogo;
};
