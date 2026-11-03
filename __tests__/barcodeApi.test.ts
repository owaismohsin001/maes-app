/**
 * @format
 */

import {
  findPickingsByOrigin,
  findProductsByReference,
  getProductDetails,
  getPickingData,
  getPartner,
  getPickingSummary,
  listNextPickings,
  productSearchDomain,
  scanFromMainMenu,
  searchProductPage,
  targetOfAction,
  validatePicking,
} from '../src/api/barcode';
import { OdooError, jsonRpc, parseOdooDate } from '../src/api/odoo';
import { ODOO_ORIGIN } from '../src/config';

// Recorded-shape responses with synthetic values only.
type Call = { url: string; body: { params: Record<string, unknown> } };
let calls: Call[] = [];
let respond: (call: Call) => unknown;

beforeEach(() => {
  calls = [];
  (globalThis as { fetch: unknown }).fetch = jest.fn(
    async (url: string, init: { body: string }) => {
      const call = { url, body: JSON.parse(init.body) };
      calls.push(call);
      const payload = respond(call);
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      };
    },
  );
});

test('a JSON-RPC result, sent with the session cookie to the Odoo origin', async () => {
  respond = () => ({ jsonrpc: '2.0', id: 1, result: { ok: 1 } });
  await expect(jsonRpc('/x', { a: 1 })).resolves.toEqual({ ok: 1 });
  expect(calls[0].url).toBe(`${ODOO_ORIGIN}/x`);
  expect(calls[0].body.params).toEqual({ a: 1 });
  const init = (globalThis.fetch as unknown as jest.Mock).mock.calls[0][1];
  expect(init.credentials).toBe('include');
});

test.each([
  ['odoo.http.SessionExpiredException', 'session'],
  ['odoo.exceptions.AccessError', 'access'],
  ['odoo.exceptions.UserError', 'user'],
  ['builtins.KeyError', 'server'],
])('Odoo error %s → %s', async (name, kind) => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    error: {
      code: 200,
      message: 'Odoo Server Error',
      data: { name, message: 'Synthetic message' },
    },
  });
  const err = (await jsonRpc('/x', {}).catch(e => e)) as OdooError;
  expect(err).toBeInstanceOf(OdooError);
  expect(err.kind).toBe(kind);
  expect(err.message).toBe('Synthetic message');
});

test('no connection is a network error', async () => {
  (globalThis.fetch as unknown as jest.Mock).mockImplementationOnce(
    async () => {
      throw new TypeError('Network request failed');
    },
  );
  const err = (await jsonRpc('/x', {}).catch(e => e)) as OdooError;
  expect(err.kind).toBe('network');
});

test('a login page instead of JSON means the session is gone', async () => {
  (globalThis.fetch as unknown as jest.Mock).mockImplementationOnce(
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }),
  );
  const err = (await jsonRpc('/x', {}).catch(e => e)) as OdooError;
  expect(err.kind).toBe('session');
});

test('main-menu answers map to native screens', async () => {
  expect(
    targetOfAction({
      type: 'ir.actions.client',
      tag: 'stock_barcode_client_action',
      res_model: 'stock.picking',
      context: { active_id: 12 },
    }),
  ).toEqual({ kind: 'picking', id: 12 });
  expect(
    targetOfAction({
      type: 'ir.actions.act_window',
      res_model: 'stock.quant',
      name: 'Test product',
      domain: [['product_id', '=', 5]],
    }),
  ).toEqual({ kind: 'product', id: 5, name: 'Test product' });
  expect(
    targetOfAction({
      type: 'ir.actions.act_window',
      res_model: 'stock.lot',
      res_id: 3,
    }),
  ).toEqual({ kind: 'odoo', model: 'stock.lot', id: 3 });

  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: { warning: 'No picking for TEST-1' },
  });
  await expect(scanFromMainMenu('TEST-1')).resolves.toEqual({
    kind: 'warning',
    message: 'No picking for TEST-1',
  });
  expect(calls[0].url).toBe(`${ODOO_ORIGIN}/stock_barcode/scan_from_main_menu`);
});

test('reference lookup: exact default_code, Odoo `false` values normalised', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: [
      {
        id: 4,
        display_name: 'Test detector',
        default_code: 'TD-100',
        barcode: false,
        tracking: 'none',
        uom_id: [1, 'Units'],
        is_storable: true,
      },
    ],
  });
  const [p] = await findProductsByReference('td-100');
  expect(p).toEqual({
    id: 4,
    name: 'Test detector',
    code: 'TD-100',
    barcode: null,
    tracking: 'none',
    uomId: 1,
    isStorable: true,
  });
  expect(calls[0].url).toContain(
    '/web/dataset/call_kw/product.product/search_read',
  );
  expect(calls[0].body.params.kwargs).toMatchObject({
    domain: [['default_code', '=ilike', 'td-100']],
  });
});

test('a transfer is found by its order number (source document)', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: [
      {
        id: 7,
        name: 'WH/IN/00001',
        state: 'assigned',
        picking_type_code: 'incoming',
        partner_id: [3, 'Test vendor'],
        origin: 'P00001',
        scheduled_date: '2026-10-26 12:00:00',
        user_id: false,
        location_id: [1, 'Partners/Vendors'],
        location_dest_id: [2, 'WH/Stock'],
        priority: '0',
      },
    ],
  });
  const [p] = await findPickingsByOrigin('p00001');
  expect(p).toMatchObject({
    id: 7,
    name: 'WH/IN/00001',
    code: 'incoming',
    partner: 'Test vendor',
    origin: 'P00001',
  });
  expect(calls[0].url).toContain(
    '/web/dataset/call_kw/stock.picking/search_read',
  );
  expect(calls[0].body.params.kwargs).toMatchObject({
    domain: [
      ['origin', '=ilike', 'p00001'],
      ['state', 'not in', ['draft', 'cancel']],
      ['move_ids', '!=', false],
    ],
  });
});

test('up next: ready transfers of one kind in every place, starred first', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: [
      {
        id: 9,
        name: 'WH/OUT/00001',
        state: 'assigned',
        picking_type_code: 'outgoing',
        picking_type_id: [4, 'WH: Delivery Orders'],
        partner_id: false,
        origin: 'S00001',
        scheduled_date: '2026-10-26 12:00:00',
        user_id: false,
        location_id: [2, 'WH/Stock'],
        location_dest_id: [5, 'Partners/Customers'],
        priority: '1',
      },
    ],
  });
  const [p] = await listNextPickings('outgoing', 2, 6);
  expect(p).toMatchObject({ id: 9, typeId: 4, priority: true });
  expect(calls[0].body.params.kwargs).toMatchObject({
    domain: [
      ['picking_type_id.code', '=', 'outgoing'],
      ['state', '=', 'assigned'],
      ['user_id', 'in', [2, false]],
    ],
    order: 'priority desc, scheduled_date asc, id desc',
    limit: 6,
  });
});

test('product details: category, unit, price and stock figures', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: [
      {
        id: 4,
        display_name: 'Test detector',
        default_code: 'TD-100',
        barcode: false,
        tracking: 'serial',
        uom_id: [1, 'Units'],
        is_storable: true,
        type: 'consu',
        categ_id: [3, 'All / Detectors'],
        lst_price: 49.5,
        currency_id: [1, 'EUR'],
        qty_available: 12,
        free_qty: 9,
        incoming_qty: 5,
        outgoing_qty: 3,
        virtual_available: 14,
      },
    ],
  });
  const p = await getProductDetails(4);
  expect(p).toMatchObject({
    code: 'TD-100',
    barcode: null,
    tracking: 'serial',
    category: 'All / Detectors',
    uom: 'Units',
    type: 'consu',
    salePrice: 49.5,
    currency: 'EUR',
    onHand: 12,
    free: 9,
    incoming: 5,
    outgoing: 3,
    forecast: 14,
  });
  expect(calls[0].url).toContain('/web/dataset/call_kw/product.product/read');
});

test('picking summary: source document and UTC scheduled date', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: [
      {
        id: 7,
        name: 'WH/IN/00001',
        state: 'assigned',
        partner_id: [2, 'Test Supplier'],
        origin: 'P00001',
        scheduled_date: '2026-10-26 12:00:00',
        date_done: '2026-10-27 08:30:00',
        user_id: false,
        location_id: [4, 'Vendors'],
        location_dest_id: [8, 'WH/Stock'],
        priority: '0',
      },
    ],
  });
  const p = await getPickingSummary(7);
  expect(p).toMatchObject({
    name: 'WH/IN/00001',
    origin: 'P00001',
    responsible: null,
    priority: false,
  });
  expect(p?.scheduled?.toISOString()).toBe('2026-10-26T12:00:00.000Z');
  expect(p?.doneAt?.toISOString()).toBe('2026-10-27T08:30:00.000Z');
  expect(p?.partnerId).toBe(2);
});

test('partner: the company with its contact person, empty fields as null', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: [
      {
        id: 12,
        name: 'Test Person',
        parent_id: [11, 'Test Supplier'],
        commercial_company_name: 'Test Supplier',
        is_company: false,
        phone: '+32 0 000 00 00',
        email: 'orders@example.test',
        street: 'Teststraat 1',
        street2: false,
        zip: '0000',
        city: 'Testdorp',
        country_id: [20, 'Belgium'],
        vat: false,
        ref: false,
      },
    ],
  });
  const partner = await getPartner(12);
  expect(partner).toEqual({
    id: 12,
    name: 'Test Supplier',
    contact: 'Test Person',
    phone: '+32 0 000 00 00',
    email: 'orders@example.test',
    address: 'Teststraat 1, 0000 Testdorp, Belgium',
    vat: null,
    ref: null,
  });
  expect(calls[0].url).toContain('/web/dataset/call_kw/res.partner/read');
});

test('partner: a company is its own name, without a contact person', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: [
      {
        id: 11,
        name: 'Test Supplier',
        parent_id: false,
        commercial_company_name: 'Test Supplier',
        is_company: true,
        phone: false,
        email: false,
        street: false,
        street2: false,
        zip: false,
        city: false,
        country_id: false,
        vat: 'BE0000000000',
        ref: 'SUP-1',
      },
    ],
  });
  expect(await getPartner(11)).toMatchObject({
    name: 'Test Supplier',
    contact: null,
    address: null,
    vat: 'BE0000000000',
    ref: 'SUP-1',
  });
});

test('picking data is normalised from get_barcode_data', async () => {
  respond = () => ({
    jsonrpc: '2.0',
    id: 1,
    result: {
      data: {
        records: {
          'stock.picking': [
            {
              id: 7,
              name: 'TEST/IN/00001',
              state: 'assigned',
              picking_type_code: 'incoming',
              picking_type_id: 2,
              partner_id: false,
              location_id: 8,
              location_dest_id: 9,
              note: false,
              use_create_lots: true,
              use_existing_lots: false,
              return_id: false,
            },
          ],
          'stock.move': [
            { id: 10, product_id: 4, product_uom_qty: 3, move_line_ids: [20] },
          ],
          'stock.move.line': [
            {
              id: 20,
              product_id: 4,
              move_id: 10,
              location_id: 8,
              location_dest_id: 9,
              qty_done: 0,
              quantity: 3,
              picked: false,
              lot_id: false,
              lot_name: false,
              product_uom_id: 1,
              package_id: false,
              result_package_id: false,
            },
          ],
          'product.product': [
            {
              id: 4,
              display_name: 'Test detector',
              default_code: 'TD-100',
              barcode: false,
              tracking: 'serial',
              uom_id: 1,
              is_storable: true,
            },
          ],
          'uom.uom': [{ id: 1, name: 'Units' }],
        },
        config: { create_backorder: 'ask', barcode_allow_extra_product: true },
        source_location_ids: [8],
        destination_locations_ids: [9],
      },
      groups: {
        group_stock_multi_locations: true,
        group_production_lot: false,
      },
    },
  });
  const data = await getPickingData(7);
  expect(calls[0].body.params).toEqual({ model: 'stock.picking', res_id: 7 });
  expect(data.picking).toMatchObject({
    name: 'TEST/IN/00001',
    partnerId: null,
    note: null,
    isReturn: false,
  });
  expect(data.lines[0]).toMatchObject({
    lotId: null,
    lotName: null,
    quantity: 3,
  });
  expect(data.products[4].tracking).toBe('serial');
  expect(data.groups).toEqual({
    multiLocations: true,
    lots: false,
    packages: false,
    uom: false,
  });
  expect(data.config.createBackorder).toBe('ask');
});

test("validate uses the Barcode app's context; a wizard means finishing in Odoo", async () => {
  respond = () => ({ jsonrpc: '2.0', id: 1, result: true });
  await expect(validatePicking(7, { isReturn: false })).resolves.toEqual({
    kind: 'done',
  });
  expect(calls[0].body.params).toMatchObject({
    model: 'stock.picking',
    method: 'button_validate',
    args: [[7]],
    kwargs: {
      context: {
        barcode_trigger: true,
        skip_backorder: true,
        display_detailed_backorder: true,
      },
    },
  });

  respond = () => ({
    jsonrpc: '2.0',
    id: 2,
    result: {
      type: 'ir.actions.act_window',
      res_model: 'quality.check.wizard',
    },
  });
  await expect(validatePicking(7, { isReturn: false })).resolves.toEqual({
    kind: 'action',
    model: 'quality.check.wizard',
  });
});

test('Odoo datetimes are UTC', () => {
  expect(parseOdooDate('2026-10-26 08:30:00')?.toISOString()).toBe(
    '2026-10-26T08:30:00.000Z',
  );
  expect(parseOdooDate(false)).toBeNull();
});

test('product search: every word in name, reference or barcode; in stock only', () => {
  expect(productSearchDomain(' pir  det ', 'inStock')).toEqual([
    '|',
    '|',
    ['default_code', 'ilike', 'pir'],
    ['name', 'ilike', 'pir'],
    ['barcode', 'ilike', 'pir'],
    '|',
    '|',
    ['default_code', 'ilike', 'det'],
    ['name', 'ilike', 'det'],
    ['barcode', 'ilike', 'det'],
    ['qty_available', '>', 0],
  ]);
});

test('a product search page: rows with stock, total only for the first page', async () => {
  respond = call =>
    call.url.endsWith('/search_count')
      ? { jsonrpc: '2.0', id: 1, result: 41 }
      : {
          jsonrpc: '2.0',
          id: 1,
          result: [
            {
              id: 7,
              display_name: 'Test siren',
              default_code: 'TS-7',
              barcode: false,
              tracking: 'none',
              uom_id: [1, 'Units'],
              is_storable: true,
              categ_id: [3, 'All / Test'],
              qty_available: 5,
              free_qty: 2,
            },
          ],
        };
  const first = await searchProductPage('siren', 'all');
  expect(first.total).toBe(41);
  expect(first.rows[0]).toMatchObject({
    id: 7,
    code: 'TS-7',
    barcode: null,
    category: 'All / Test',
    uom: 'Units',
    onHand: 5,
    free: 2,
  });
  calls = [];
  const next = await searchProductPage('siren', 'all', 30);
  expect(next.total).toBeNull();
  expect(calls).toHaveLength(1);
  expect(calls[0].body.params.kwargs).toMatchObject({ offset: 30, limit: 30 });
});
