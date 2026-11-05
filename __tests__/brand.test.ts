/**
 * Every brand file is complete, and the build under test (APP_BRAND) is the
 * one src/config.ts exposes. The Android flavor ↔ brand match is checked by
 * scripts/build-apk.sh (the bundled host) and build.gradle (APP_BRAND guard).
 */
import { BRAND, ODOO_ORIGIN, ODOO_WEB_URL } from '../src/config';
import maes from '../src/brand';
import castillo from '../src/brand/castillo';
import type { Brand } from '../src/brand/types';

// Jest runs on Node; the RN tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

const brands: Brand[] = [maes, castillo];

test.each(brands)('brand $key is complete', brand => {
  expect(brand.appName).not.toBe('');
  expect(brand.companyName).not.toBe('');
  expect(brand.odooOrigin).toMatch(/^https:\/\/[^/]+$/);
  expect(brand.logo.full).toBeTruthy();
  expect(brand.logo.withoutRing).toBeTruthy();
  expect(brand.logo.mark).toBeTruthy();
  const { size, ring } = brand.logo;
  expect(size.width).toBeGreaterThan(0);
  expect(size.height).toBeGreaterThan(0);
  // The ring lies inside the logo's canvas (the splash draws it there).
  expect(ring.cx - ring.rOuter).toBeGreaterThanOrEqual(0);
  expect(ring.cy - ring.rOuter).toBeGreaterThanOrEqual(0);
  expect(ring.cx + ring.rOuter).toBeLessThanOrEqual(size.width);
  expect(ring.cy + ring.rOuter).toBeLessThanOrEqual(size.height);
  expect(ring.stroke).toBeGreaterThan(0);
});

test('brands point at different servers and have different keys', () => {
  expect(new Set(brands.map(b => b.key)).size).toBe(brands.length);
  expect(new Set(brands.map(b => b.odooOrigin)).size).toBe(brands.length);
});

test('castillo is the Odoo Online database of Castillo Valère', () => {
  expect(castillo.odooOrigin).toBe('https://castillo-valere.odoo.com');
  expect(castillo.appName).toBe('Castillo Scan');
});

test('the build under test exposes its brand through config', () => {
  const expected =
    (process.env.APP_BRAND || 'maes') === 'castillo' ? castillo : maes;
  expect(BRAND).toBe(expected);
  expect(ODOO_ORIGIN).toBe(expected.odooOrigin);
  expect(ODOO_WEB_URL).toBe(`${expected.odooOrigin}/odoo`);
});
