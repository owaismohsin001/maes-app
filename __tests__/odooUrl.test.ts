/**
 * @format
 */

import { ODOO_ORIGIN } from '../src/config';
import {
  hostOf,
  isAuthPage,
  isBarcodeAppUrl,
  isOdooUrl,
} from '../src/utils/odooUrl';

const ODOO = ODOO_ORIGIN;

test('hostOf', () => {
  expect(hostOf('https://Example.COM:8443/a?b#c')).toBe('example.com');
  expect(hostOf('http://user:pw@example.com/')).toBe('example.com');
  expect(hostOf('mailto:someone@example.com')).toBeNull();
  expect(hostOf('about:blank')).toBeNull();
});

test('isOdooUrl only matches the configured Odoo host', () => {
  expect(isOdooUrl(`${ODOO}/odoo/action-123`)).toBe(true);
  expect(isOdooUrl('https://example.com/odoo')).toBe(false);
  expect(isOdooUrl('tel:+3200000000')).toBe(false);
});

test('isAuthPage recognises the sign-in pages', () => {
  expect(isAuthPage(`${ODOO}/web/login`)).toBe(true);
  expect(isAuthPage(`${ODOO}/web/login?redirect=%2Fodoo`)).toBe(true);
  expect(isAuthPage(`${ODOO}/web/login/totp`)).toBe(true);
  expect(isAuthPage(`${ODOO}/web/reset_password`)).toBe(true);
  expect(isAuthPage(`${ODOO}/odoo`)).toBe(false);
  expect(isAuthPage(`${ODOO}/web/loginx`)).toBe(false);
  expect(isAuthPage(`${ODOO}/`)).toBe(false);
  expect(isAuthPage('https://example.com/web/login')).toBe(false);
});

test('isBarcodeAppUrl recognises the Barcode app and the screens opened from it', () => {
  expect(isBarcodeAppUrl(`${ODOO}/odoo/barcode`)).toBe(true);
  expect(isBarcodeAppUrl(`${ODOO}/odoo/barcode?debug=1`)).toBe(true);
  expect(isBarcodeAppUrl(`${ODOO}/odoo/barcode/action-545/12`)).toBe(true);
  expect(isBarcodeAppUrl(`${ODOO}/odoo/barcode-operations`)).toBe(true);
  expect(isBarcodeAppUrl(`${ODOO}/odoo/barcode-batches/7`)).toBe(true);
  expect(isBarcodeAppUrl(`${ODOO}/odoo`)).toBe(false);
  expect(isBarcodeAppUrl(`${ODOO}/odoo/inventory`)).toBe(false);
  expect(isBarcodeAppUrl(`${ODOO}/odoo/barcodes`)).toBe(false);
  expect(isBarcodeAppUrl('https://example.com/odoo/barcode')).toBe(false);
});
