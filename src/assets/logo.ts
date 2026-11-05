/**
 * The brand's logo assets (`BRAND.logo`, see `src/brand/`), plus the geometry
 * shared by everything that draws the loading ring on it (the splash spinner
 * and `LogoSpinner`). Measurements are in source px of `LOGO_SIZE`.
 */
import { BRAND } from '../config';

/** The complete logo, for static use (home screen, headers). */
export const logoFull = BRAND.logo.full;

/** The complete logo with the ring's place left empty; draw the ring at `LOGO_RING`. */
export const logoWithoutRing = BRAND.logo.withoutRing;

/** Only the mark, cropped to the ring's bounding square (ring = the whole square). */
export const logoM = BRAND.logo.mark;

export const LOGO_SIZE = BRAND.logo.size;

/** Centre, outer radius and stroke of the loading ring. */
export const LOGO_RING = BRAND.logo.ring;

/** Diameter of the ring, in source px. */
export const LOGO_RING_DIAMETER = 2 * LOGO_RING.rOuter;
