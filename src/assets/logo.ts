/**
 * MAES Security logo assets, plus the geometry shared by everything that draws
 * the ring around the "M" itself (the splash spinner and `LogoSpinner`).
 *
 * Measurements are in px of the original 268×160 `maes_logo.png`.
 */

/** The complete logo, for static use (home screen, headers). */
export const logoFull = require('./images/maes_logo.png');

/**
 * The complete logo with the ring around the "M" erased (4× upscale of the
 * original). Draw the ring yourself at `LOGO_RING`.
 */
export const logoWithoutRing = require('./images/maes_logo_mark.png');

/**
 * Only the "M", cropped to the ring's bounding square (ring erased, 441×441).
 * Its ring is the whole square: offset 0, diameter = rendered size.
 */
export const logoM = require('./images/maes_logo_m.png');

export const LOGO_SIZE = { width: 268, height: 160 } as const;

/** Centre, outer radius and stroke of the ring around the "M" (measured from the file). */
export const LOGO_RING = {
  cx: 56.35,
  cy: 56.15,
  rOuter: 55.13,
  stroke: 2.75,
} as const;

/** Diameter of the ring, in source px. */
export const LOGO_RING_DIAMETER = 2 * LOGO_RING.rOuter;
