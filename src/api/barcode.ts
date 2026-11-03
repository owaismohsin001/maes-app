import {
  Many2one,
  callKw,
  jsonRpc,
  m2oId,
  m2oName,
  orNull,
  parseOdooDate,
} from './odoo';

/**
 * Odoo 19 Barcode app (`stock_barcode`) data for the native scan screens: the
 * same routes and methods Odoo's own Barcode client calls
 * (`stock_barcode/controllers/stock_barcode.py`, `static/src/models/*.js`),
 * normalised into clean types.
 */

// -----------------------------------------------------------------------------
// Types the screens use
// -----------------------------------------------------------------------------

export type Tracking = 'none' | 'lot' | 'serial';
export type OperationCode = 'incoming' | 'outgoing' | 'internal';

export type Product = {
  id: number;
  name: string;
  /** Internal reference (`default_code`). */
  code: string | null;
  barcode: string | null;
  tracking: Tracking;
  uomId: number | null;
  isStorable: boolean;
};

export type Location = {
  id: number;
  name: string;
  barcode: string | null;
  usage: string;
  parentPath: string;
};

export type Lot = { id: number; name: string; productId: number | null };

export type MoveLine = {
  id: number;
  productId: number;
  moveId: number | null;
  locationId: number | null;
  locationDestId: number | null;
  /** Picked quantity (`qty_done`: `quantity` once picked, else 0). */
  qtyDone: number;
  /** `quantity` on the line: reserved, or picked once picked. */
  quantity: number;
  /** Reserved quantity as first loaded (see `carryReserved`). */
  reserved: number;
  picked: boolean;
  lotId: number | null;
  lotName: string | null;
  uomId: number | null;
  packageId: number | null;
  resultPackageId: number | null;
};

export type Move = {
  id: number;
  productId: number;
  demand: number;
  lineIds: number[];
};

export type PickingConfig = {
  allowExtraProduct: boolean;
  /** Validating with nothing scanned is allowed. */
  validationFull: boolean;
  createBackorder: 'ask' | 'always' | 'never';
  restrictScanProduct: boolean;
  restrictScanSourceLocation: boolean;
  restrictScanDestLocation: 'mandatory' | 'optional' | 'no';
  restrictScanTrackingNumber: boolean;
  linesNeedDestinationLocation: boolean;
  linesNeedToBePacked: boolean;
};

export type Groups = {
  multiLocations: boolean;
  lots: boolean;
  packages: boolean;
  uom: boolean;
};

export type PickingState =
  | 'draft'
  | 'waiting'
  | 'confirmed'
  | 'assigned'
  | 'done'
  | 'cancel';

export type Picking = {
  id: number;
  name: string;
  state: PickingState;
  code: OperationCode | string;
  typeId: number | null;
  partnerId: number | null;
  locationId: number | null;
  locationDestId: number | null;
  note: string | null;
  useCreateLots: boolean;
  useExistingLots: boolean;
  /** Set on a return: never ask for a backorder. */
  isReturn: boolean;
};

/** Everything the transfer screen needs, as `get_barcode_data` returns it. */
export type PickingData = {
  picking: Picking;
  moves: Move[];
  lines: MoveLine[];
  products: Record<number, Product>;
  locations: Record<number, Location>;
  lots: Record<number, Lot>;
  uoms: Record<number, string>;
  partners: Record<number, string>;
  config: PickingConfig;
  sourceLocationIds: number[];
  destLocationIds: number[];
  groups: Groups;
};

export type Quant = {
  id: number;
  productId: number;
  locationId: number;
  lotId: number | null;
  /** On hand. */
  quantity: number;
  /** Counted quantity. */
  inventoryQuantity: number;
  inventoryQuantitySet: boolean;
  inventoryDate: string | null;
  userId: number | null;
  packageId: number | null;
};

export type CountData = {
  quants: Quant[];
  products: Record<number, Product>;
  locations: Record<number, Location>;
  lots: Record<number, Lot>;
  uoms: Record<number, string>;
  /** Show the expected (on-hand) quantity next to the count. */
  showQuantity: boolean;
  userId: number | null;
  groups: Groups;
};

export type OperationType = {
  id: number;
  name: string;
  code: OperationCode;
  warehouse: string | null;
  ready: number;
  waiting: number;
  late: number;
};

export type PickingSummary = {
  id: number;
  name: string;
  state: PickingState;
  code: OperationCode | null;
  /** Its operation type (says which warehouse or van). */
  typeId: number | null;
  partner: string | null;
  partnerId: number | null;
  origin: string | null;
  scheduled: Date | null;
  /** When it was validated (goods received, delivered or moved). */
  doneAt: Date | null;
  responsible: string | null;
  from: string | null;
  to: string | null;
  priority: boolean;
};

export type StockLine = {
  id: number;
  location: string;
  lot: string | null;
  quantity: number;
  reserved: number;
};

export type SessionInfo = { uid: number; name: string; lang: string | null };

export type MainMenuData = {
  groups: { locations: boolean; packages: boolean; tracking: boolean };
  /** Quants waiting to be counted by this user. */
  toCount: number;
};

/** Where a scan on the main menu leads (`/stock_barcode/scan_from_main_menu`). */
export type MainMenuTarget =
  | { kind: 'picking'; id: number }
  | { kind: 'count' }
  | { kind: 'product'; id: number; name: string }
  /** An Odoo screen we don't have natively (lot, package, batch, MO…). */
  | { kind: 'odoo'; model: string; id: number }
  | { kind: 'warning'; message: string };

// -----------------------------------------------------------------------------
// Raw shapes (records read with `load=False`: many2one = id | false)
// -----------------------------------------------------------------------------

type Raw = Record<string, unknown>;
type RawRecords = Record<string, Raw[] | undefined>;

type RawGroups = {
  group_stock_multi_locations?: boolean;
  group_production_lot?: boolean;
  group_tracking_lot?: boolean;
  group_uom?: boolean;
};

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function refId(v: unknown): number | null {
  return typeof v === 'number' ? v : m2oId(v as Many2one);
}

function byId<T extends { id: number }>(items: T[]): Record<number, T> {
  const out: Record<number, T> = {};
  for (const item of items) {
    out[item.id] = item;
  }
  return out;
}

export function toProduct(r: Raw): Product {
  const tracking = r.tracking;
  return {
    id: num(r.id),
    name: str(r.display_name) ?? '',
    code: str(orNull(r.default_code as string | false)),
    barcode: str(orNull(r.barcode as string | false)),
    tracking: tracking === 'lot' || tracking === 'serial' ? tracking : 'none',
    uomId: refId(r.uom_id),
    isStorable: r.is_storable !== false,
  };
}

function toLocation(r: Raw): Location {
  return {
    id: num(r.id),
    name: str(r.display_name) ?? str(r.name) ?? '',
    barcode: str(orNull(r.barcode as string | false)),
    usage: str(r.usage) ?? '',
    parentPath: str(r.parent_path) ?? '',
  };
}

function toLot(r: Raw): Lot {
  return {
    id: num(r.id),
    name: str(r.name) ?? '',
    productId: refId(r.product_id),
  };
}

function toMoveLine(r: Raw): MoveLine {
  return {
    id: num(r.id),
    productId: refId(r.product_id) ?? 0,
    moveId: refId(r.move_id),
    locationId: refId(r.location_id),
    locationDestId: refId(r.location_dest_id),
    qtyDone: num(r.qty_done),
    quantity: num(r.quantity),
    reserved: num(r.quantity),
    picked: r.picked === true,
    lotId: refId(r.lot_id),
    lotName: str(orNull(r.lot_name as string | false)),
    uomId: refId(r.product_uom_id),
    packageId: refId(r.package_id),
    resultPackageId: refId(r.result_package_id),
  };
}

function toMove(r: Raw): Move {
  return {
    id: num(r.id),
    productId: refId(r.product_id) ?? 0,
    demand: num(r.product_uom_qty),
    lineIds: Array.isArray(r.move_line_ids)
      ? (r.move_line_ids as number[])
      : [],
  };
}

function toQuant(r: Raw): Quant {
  return {
    id: num(r.id),
    productId: refId(r.product_id) ?? 0,
    locationId: refId(r.location_id) ?? 0,
    lotId: refId(r.lot_id),
    quantity: num(r.quantity),
    inventoryQuantity: num(r.inventory_quantity),
    inventoryQuantitySet: r.inventory_quantity_set === true,
    inventoryDate: str(orNull(r.inventory_date as string | false)),
    userId: refId(r.user_id),
    packageId: refId(r.package_id),
  };
}

function toGroups(g: RawGroups | undefined): Groups {
  return {
    multiLocations: g?.group_stock_multi_locations === true,
    lots: g?.group_production_lot === true,
    packages: g?.group_tracking_lot === true,
    uom: g?.group_uom === true,
  };
}

function toConfig(c: Raw | undefined): PickingConfig {
  const backorder = c?.create_backorder;
  const dest = c?.restrict_scan_dest_location;
  return {
    allowExtraProduct: c?.barcode_allow_extra_product !== false,
    validationFull: c?.barcode_validation_full !== false,
    createBackorder:
      backorder === 'always' || backorder === 'never' ? backorder : 'ask',
    restrictScanProduct: c?.restrict_scan_product === true,
    restrictScanSourceLocation: c?.restrict_scan_source_location === true,
    restrictScanDestLocation:
      dest === 'mandatory' || dest === 'no' ? dest : 'optional',
    restrictScanTrackingNumber: c?.restrict_scan_tracking_number === true,
    linesNeedDestinationLocation: c?.lines_need_destination_location === true,
    linesNeedToBePacked: c?.lines_need_to_be_packed === true,
  };
}

function recordsOf(records: RawRecords, model: string): Raw[] {
  return records[model] ?? [];
}

function namesOf(records: RawRecords, model: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const r of recordsOf(records, model)) {
    out[num(r.id)] = str(r.display_name) ?? str(r.name) ?? '';
  }
  return out;
}

type RawPickingData = {
  records: RawRecords;
  config?: Raw;
  source_location_ids?: number[];
  destination_locations_ids?: number[];
};

/** Normalises `_get_stock_barcode_data()` of a picking. */
export function toPickingData(
  raw: RawPickingData,
  pickingId: number,
  groups: Groups,
): PickingData {
  const records = raw.records;
  const rawPicking =
    recordsOf(records, 'stock.picking').find(p => p.id === pickingId) ??
    recordsOf(records, 'stock.picking')[0] ??
    {};
  const state = str(rawPicking.state) as PickingState | null;
  return {
    picking: {
      id: num(rawPicking.id, pickingId),
      name: str(rawPicking.name) ?? '',
      state: state ?? 'draft',
      code: str(rawPicking.picking_type_code) ?? '',
      typeId: refId(rawPicking.picking_type_id),
      partnerId: refId(rawPicking.partner_id),
      locationId: refId(rawPicking.location_id),
      locationDestId: refId(rawPicking.location_dest_id),
      note: str(orNull(rawPicking.note as string | false)),
      useCreateLots: rawPicking.use_create_lots === true,
      useExistingLots: rawPicking.use_existing_lots === true,
      isReturn: refId(rawPicking.return_id) !== null,
    },
    moves: recordsOf(records, 'stock.move').map(toMove),
    lines: recordsOf(records, 'stock.move.line').map(toMoveLine),
    products: byId(recordsOf(records, 'product.product').map(toProduct)),
    locations: byId(recordsOf(records, 'stock.location').map(toLocation)),
    lots: byId(recordsOf(records, 'stock.lot').map(toLot)),
    uoms: namesOf(records, 'uom.uom'),
    partners: namesOf(records, 'res.partner'),
    config: toConfig(raw.config),
    sourceLocationIds: raw.source_location_ids ?? [],
    destLocationIds: raw.destination_locations_ids ?? [],
    groups,
  };
}

type RawCountData = {
  records: RawRecords;
  show_quantity_count?: boolean;
  user_id?: number;
};

/** Normalises `stock.quant._get_stock_barcode_data()`. */
export function toCountData(raw: RawCountData, groups: Groups): CountData {
  const records = raw.records;
  return {
    quants: recordsOf(records, 'stock.quant').map(toQuant),
    products: byId(recordsOf(records, 'product.product').map(toProduct)),
    locations: byId(recordsOf(records, 'stock.location').map(toLocation)),
    lots: byId(recordsOf(records, 'stock.lot').map(toLot)),
    uoms: namesOf(records, 'uom.uom'),
    showQuantity: raw.show_quantity_count === true,
    userId: typeof raw.user_id === 'number' ? raw.user_id : null,
    groups,
  };
}

// -----------------------------------------------------------------------------
// Calls
// -----------------------------------------------------------------------------

export async function getSessionInfo(): Promise<SessionInfo> {
  const info = await jsonRpc<{
    uid: number | false;
    name?: string;
    user_context?: { lang?: string };
  }>('/web/session/get_session_info', {});
  if (!info.uid) {
    throw new Error('no session');
  }
  return {
    uid: info.uid,
    name: info.name ?? '',
    lang: info.user_context?.lang ?? null,
  };
}

export async function getMainMenuData(): Promise<MainMenuData> {
  const raw = await jsonRpc<{
    groups: { locations: boolean; package: boolean; tracking: boolean };
    quant_count: number;
  }>('/stock_barcode/get_main_menu_data', {});
  return {
    groups: {
      locations: raw.groups.locations,
      packages: raw.groups.package,
      tracking: raw.groups.tracking,
    },
    toCount: raw.quant_count,
  };
}

type RawAction = {
  type?: string;
  tag?: string;
  res_model?: string;
  res_id?: number;
  domain?: unknown;
  context?: { active_id?: number };
  name?: string;
};

/** Where an Odoo action returned by the Barcode app would lead. */
export function targetOfAction(action: RawAction): MainMenuTarget {
  const model = action.res_model ?? '';
  const activeId = action.context?.active_id;
  if (action.type === 'ir.actions.client' && model === 'stock.picking') {
    if (typeof activeId === 'number') {
      return { kind: 'picking', id: activeId };
    }
  }
  if (action.type === 'ir.actions.client' && model === 'stock.quant') {
    return { kind: 'count' };
  }
  if (model === 'stock.quant' && Array.isArray(action.domain)) {
    const term = (action.domain as unknown[]).find(
      d => Array.isArray(d) && d[0] === 'product_id' && d[1] === '=',
    ) as [string, string, number] | undefined;
    if (term && typeof term[2] === 'number') {
      return { kind: 'product', id: term[2], name: action.name ?? '' };
    }
  }
  const recordId =
    typeof action.res_id === 'number' ? action.res_id : activeId ?? null;
  if (model && recordId) {
    return { kind: 'odoo', model, id: recordId };
  }
  return { kind: 'warning', message: '' };
}

export async function scanFromMainMenu(
  barcode: string,
): Promise<MainMenuTarget> {
  const raw = await jsonRpc<{ action?: RawAction; warning?: string }>(
    '/stock_barcode/scan_from_main_menu',
    { barcode },
  );
  if (raw.action) {
    return targetOfAction(raw.action);
  }
  return { kind: 'warning', message: raw.warning ?? '' };
}

const PRODUCT_FIELDS = [
  'barcode',
  'default_code',
  'display_name',
  'tracking',
  'uom_id',
  'is_storable',
];

/**
 * Products whose internal reference is exactly `code` (case-insensitive).
 * Odoo's Barcode app only matches `barcode`; most MAES products only have a
 * reference, so the app adds this lookup.
 */
export async function findProductsByReference(
  code: string,
): Promise<Product[]> {
  const rows = await callKw<Raw[]>('product.product', 'search_read', [], {
    domain: [['default_code', '=ilike', code]],
    fields: PRODUCT_FIELDS,
    limit: 5,
    context: { display_default_code: false },
  });
  return rows.map(toProduct);
}

/** Manual search by name, reference or barcode. */
export async function searchProducts(query: string): Promise<Product[]> {
  const rows = await callKw<Raw[]>('product.product', 'search_read', [], {
    domain: [
      '|',
      '|',
      ['default_code', 'ilike', query],
      ['name', 'ilike', query],
      ['barcode', 'ilike', query],
    ],
    fields: PRODUCT_FIELDS,
    limit: 25,
    order: 'default_code, name',
    context: { display_default_code: false },
  });
  return rows.map(toProduct);
}

/** A row of the Find-a-product screen: the product and its stock at a glance. */
export type ProductHit = Product & {
  /** Full category path ("All / Alarm / Detectors"). */
  category: string | null;
  uom: string | null;
  onHand: number;
  free: number;
};

export type ProductSearchFilter = 'all' | 'inStock';

export type ProductSearchPage = {
  rows: ProductHit[];
  /** How many products match in all (only asked for the first page). */
  total: number | null;
};

export const PRODUCT_PAGE_SIZE = 30;

const PRODUCT_HIT_FIELDS = [
  ...PRODUCT_FIELDS,
  'categ_id',
  'qty_available',
  'free_qty',
];

export function toProductHit(r: Raw): ProductHit {
  return {
    ...toProduct(r),
    category: m2oName(r.categ_id as Many2one),
    uom: m2oName(r.uom_id as Many2one),
    onHand: num(r.qty_available),
    free: num(r.free_qty),
  };
}

/**
 * Every word must be in the name, reference or barcode, in any order:
 * "pir det" finds "Detector PIR …".
 */
export function productSearchDomain(
  query: string,
  filter: ProductSearchFilter,
): unknown[] {
  const domain: unknown[] = [];
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    domain.push(
      '|',
      '|',
      ['default_code', 'ilike', word],
      ['name', 'ilike', word],
      ['barcode', 'ilike', word],
    );
  }
  if (filter === 'inStock') {
    domain.push(['qty_available', '>', 0]);
  }
  return domain;
}

/** One page of the Find-a-product screen (search by name, reference, barcode). */
export async function searchProductPage(
  query: string,
  filter: ProductSearchFilter,
  offset = 0,
): Promise<ProductSearchPage> {
  const domain = productSearchDomain(query, filter);
  const [rows, total] = await Promise.all([
    callKw<Raw[]>('product.product', 'search_read', [], {
      domain,
      fields: PRODUCT_HIT_FIELDS,
      limit: PRODUCT_PAGE_SIZE,
      offset,
      order: 'default_code, name, id',
      context: { display_default_code: false },
    }),
    offset === 0
      ? callKw<number>('product.product', 'search_count', [domain])
      : Promise.resolve(null),
  ]);
  return { rows: rows.map(toProductHit), total };
}

export type BarcodeMatches = {
  products: Product[];
  locations: Location[];
  lots: Lot[];
  pickings: { id: number; name: string }[];
};

/** What a code is in Odoo: `/stock_barcode/get_specific_barcode_data`. */
export async function lookupBarcode(barcode: string): Promise<BarcodeMatches> {
  const raw = await jsonRpc<RawRecords>(
    '/stock_barcode/get_specific_barcode_data',
    { barcode },
  );
  return {
    products: recordsOf(raw, 'product.product').map(toProduct),
    locations: recordsOf(raw, 'stock.location').map(toLocation),
    lots: recordsOf(raw, 'stock.lot').map(toLot),
    pickings: recordsOf(raw, 'stock.picking').map(r => ({
      id: num(r.id),
      name: str(r.name) ?? '',
    })),
  };
}

/** Operation types shown in the Barcode app (receipts, deliveries, internal). */
export async function listOperationTypes(): Promise<OperationType[]> {
  const rows = await callKw<Raw[]>('stock.picking.type', 'search_read', [], {
    domain: [['code', 'in', ['incoming', 'outgoing', 'internal']]],
    fields: [
      'name',
      'code',
      'warehouse_id',
      'count_picking_ready',
      'count_picking_waiting',
      'count_picking_late',
    ],
    order: 'sequence, id',
    limit: 200,
  });
  return rows.map(r => ({
    id: num(r.id),
    name: str(r.name) ?? '',
    code: str(r.code) as OperationCode,
    warehouse: m2oName(r.warehouse_id as Many2one),
    ready: num(r.count_picking_ready),
    waiting: num(r.count_picking_waiting),
    late: num(r.count_picking_late),
  }));
}

const PICKING_SUMMARY_FIELDS = [
  'name',
  'state',
  'picking_type_code',
  'picking_type_id',
  'partner_id',
  'origin',
  'scheduled_date',
  'date_done',
  'user_id',
  'location_id',
  'location_dest_id',
  'priority',
];

function toPickingSummary(r: Raw): PickingSummary {
  return {
    id: num(r.id),
    name: str(r.name) ?? '',
    state: (str(r.state) ?? 'draft') as PickingState,
    code: str(r.picking_type_code) as OperationCode | null,
    typeId: refId(r.picking_type_id),
    partner: m2oName(r.partner_id as Many2one),
    partnerId: refId(r.partner_id),
    origin: str(orNull(r.origin as string | false)),
    scheduled: parseOdooDate(r.scheduled_date as string | false),
    doneAt: parseOdooDate(r.date_done as string | false),
    responsible: m2oName(r.user_id as Many2one),
    from: m2oName(r.location_id as Many2one),
    to: m2oName(r.location_dest_id as Many2one),
    priority: r.priority === '1',
  };
}

export type PickingFilter = 'ready' | 'open';

/**
 * Transfers of one operation type, like the Barcode app's list: the user's
 * and unassigned ones; "ready" (reserved) by default, or every open one
 * (drafts excluded: nothing to do on them at the warehouse yet).
 */
export async function listPickings(
  typeId: number,
  filter: PickingFilter,
  uid: number,
  offset = 0,
  limit = 40,
): Promise<PickingSummary[]> {
  const states =
    filter === 'ready' ? ['assigned'] : ['waiting', 'confirmed', 'assigned'];
  const rows = await callKw<Raw[]>('stock.picking', 'search_read', [], {
    domain: [
      ['picking_type_id', '=', typeId],
      ['state', 'in', states],
      ['user_id', 'in', [uid, false]],
    ],
    fields: PICKING_SUMMARY_FIELDS,
    order: 'priority desc, scheduled_date asc, id desc',
    offset,
    limit,
  });
  return rows.map(toPickingSummary);
}

/**
 * The transfers of one kind to do first, in every warehouse and van: ready
 * (reserved) ones of the user or unassigned, starred first, then by
 * scheduled date (so the late ones lead).
 */
export async function listNextPickings(
  code: OperationCode,
  uid: number,
  limit = 6,
): Promise<PickingSummary[]> {
  const rows = await callKw<Raw[]>('stock.picking', 'search_read', [], {
    domain: [
      ['picking_type_id.code', '=', code],
      ['state', '=', 'assigned'],
      ['user_id', 'in', [uid, false]],
    ],
    fields: PICKING_SUMMARY_FIELDS,
    order: 'priority desc, scheduled_date asc, id desc',
    limit,
  });
  return rows.map(toPickingSummary);
}

/**
 * Transfers whose source document is `code`, e.g. a purchase or sale order
 * number. Odoo's Barcode app only matches a transfer's own name, but the
 * paperwork at the warehouse carries the order number. Done transfers are
 * included (the screen says so). Cancelled and draft ones are not: there is
 * nothing to do on them at the warehouse (a delivery emptied in Odoo drops
 * back to draft); neither are transfers without a single product.
 */
export async function findPickingsByOrigin(
  code: string,
): Promise<PickingSummary[]> {
  const rows = await callKw<Raw[]>('stock.picking', 'search_read', [], {
    domain: [
      ['origin', '=ilike', code],
      ['state', 'not in', ['draft', 'cancel']],
      ['move_ids', '!=', false],
    ],
    fields: PICKING_SUMMARY_FIELDS,
    order: 'state asc, priority desc, scheduled_date asc, id desc',
    limit: 20,
  });
  return rows.map(toPickingSummary);
}

/** One transfer's header facts (source document, scheduled date…). */
export async function getPickingSummary(
  pickingId: number,
): Promise<PickingSummary | null> {
  const rows = await callKw<Raw[]>('stock.picking', 'read', [[pickingId]], {
    fields: PICKING_SUMMARY_FIELDS,
  });
  return rows[0] ? toPickingSummary(rows[0]) : null;
}

/** A transfer's partner (vendor, customer) as the warehouse needs it. */
export type PartnerInfo = {
  id: number;
  /** The company, or the person when there is no company. */
  name: string;
  /** The person at the company, when the transfer names one. */
  contact: string | null;
  phone: string | null;
  email: string | null;
  /** One line: street, zip and city, country. */
  address: string | null;
  vat: string | null;
  /** The partner's internal reference in Odoo. */
  ref: string | null;
};

const PARTNER_FIELDS = [
  'name',
  'parent_id',
  'commercial_company_name',
  'is_company',
  'phone',
  'email',
  'street',
  'street2',
  'zip',
  'city',
  'country_id',
  'vat',
  'ref',
];

export async function getPartner(id: number): Promise<PartnerInfo | null> {
  const rows = await callKw<Raw[]>('res.partner', 'read', [[id]], {
    fields: PARTNER_FIELDS,
  });
  const r = rows[0];
  if (!r) {
    return null;
  }
  const text = (v: unknown) => str(orNull(v as string | false))?.trim() || null;
  const own = text(r.name);
  const company = text(r.commercial_company_name);
  const inCompany = r.is_company !== true && r.parent_id !== false && !!company;
  const place = [text(r.zip), text(r.city)].filter(Boolean).join(' ');
  const address = [
    text(r.street),
    text(r.street2),
    place,
    m2oName(r.country_id as Many2one),
  ]
    .filter(Boolean)
    .join(', ');
  return {
    id: num(r.id),
    name: (inCompany ? company : own) ?? company ?? '',
    contact: inCompany ? own : null,
    phone: text(r.phone),
    email: text(r.email),
    address: address || null,
    vat: text(r.vat),
    ref: text(r.ref),
  };
}

/** Creates an empty transfer of a type (the Barcode app's "New" button). */
export async function getPickingData(id: number): Promise<PickingData> {
  const raw = await jsonRpc<{ data: RawPickingData; groups: RawGroups }>(
    '/stock_barcode/get_barcode_data',
    { model: 'stock.picking', res_id: id },
  );
  return toPickingData(raw.data, id, toGroups(raw.groups));
}

/**
 * A fingerprint of a transfer, its moves and move lines (ids + write dates):
 * changes when anyone edits, adds or removes one (the order changed, another
 * device scanned, the transfer was validated). Three small reads instead of
 * the full barcode data.
 */
export async function pickingStamp(pickingId: number): Promise<string> {
  const stampOf = (model: string, field: string) =>
    callKw<Raw[]>(model, 'search_read', [], {
      domain: [[field, '=', pickingId]],
      fields: ['write_date'],
      order: 'id',
      limit: 1000,
    }).then(rows => rows.map(r => `${r.id}@${r.write_date}`).join(','));
  const parts = await Promise.all([
    stampOf('stock.picking', 'id'),
    stampOf('stock.move', 'picking_id'),
    stampOf('stock.move.line', 'picking_id'),
  ]);
  return parts.join('|');
}

/** ORM commands on `move_line_ids`: [0, 0, vals] create, [1, id, vals] update. */
export type LineCommand =
  | [0, 0, Record<string, unknown>]
  | [1, number, Record<string, unknown>];

export async function savePickingLines(
  pickingId: number,
  commands: LineCommand[],
  groups: Groups,
): Promise<PickingData> {
  const raw = await jsonRpc<RawPickingData>(
    '/stock_barcode/save_barcode_data',
    {
      model: 'stock.picking',
      res_id: pickingId,
      write_field: 'move_line_ids',
      write_vals: commands,
    },
  );
  return toPickingData(raw, pickingId, groups);
}

export type ValidateResult =
  | { kind: 'done' }
  /** Odoo answered with a wizard (lots, quality checks…): finish it in Odoo. */
  | { kind: 'action'; model: string };

export async function validatePicking(
  pickingId: number,
  { isReturn }: { isReturn: boolean },
): Promise<ValidateResult> {
  const context: Record<string, unknown> = {
    display_detailed_backorder: true,
    skip_backorder: true,
    barcode_trigger: true,
  };
  if (isReturn) {
    context.picking_ids_not_to_backorder = pickingId;
  }
  const result = await callKw<RawAction | boolean>(
    'stock.picking',
    'button_validate',
    [[pickingId]],
    { context },
    45000,
  );
  if (
    result &&
    typeof result === 'object' &&
    (result.res_model || result.type === 'ir.actions.client')
  ) {
    return { kind: 'action', model: result.res_model ?? '' };
  }
  return { kind: 'done' };
}

/** The backorders a validation created. */
export async function backordersOf(
  pickingId: number,
): Promise<{ id: number; name: string }[]> {
  const rows = await callKw<Raw[]>('stock.picking', 'search_read', [], {
    domain: [['backorder_id', '=', pickingId]],
    fields: ['display_name'],
    limit: 10,
  });
  return rows.map(r => ({ id: num(r.id), name: str(r.display_name) ?? '' }));
}

export async function pickingState(pickingId: number): Promise<PickingState> {
  const rows = await callKw<Raw[]>('stock.picking', 'read', [[pickingId]], {
    fields: ['state'],
  });
  return ((rows[0] && str(rows[0].state)) ?? 'draft') as PickingState;
}

/**
 * Leaving a transfer without validating: split what was picked from what
 * wasn't, like the Barcode app's `_onExit` (`stock.move.post_barcode_process`).
 */
export async function postBarcodeProcess(data: PickingData): Promise<void> {
  if (['done', 'cancel'].includes(data.picking.state) || !data.moves.length) {
    return;
  }
  const quantities: Record<
    string,
    { quantity_done: number; reserved_uom_qty: number }
  > = {};
  for (const line of data.lines) {
    if (line.moveId === null) {
      continue;
    }
    const entry = (quantities[String(line.moveId)] ??= {
      quantity_done: 0,
      reserved_uom_qty: 0,
    });
    entry.quantity_done += line.qtyDone;
    entry.reserved_uom_qty += line.reserved;
  }
  await callKw('stock.move', 'post_barcode_process', [
    data.moves.map(m => m.id),
    quantities,
  ]);
}

export async function getCountData(): Promise<CountData> {
  const raw = await jsonRpc<{ data: RawCountData; groups: RawGroups }>(
    '/stock_barcode/get_barcode_data',
    { model: 'stock.quant', res_id: false },
    45000,
  );
  return toCountData(raw.data, toGroups(raw.groups));
}

/** Existing quants for a product in a location (`/stock_barcode/get_quants`). */
export async function getQuants(
  productId: number,
  locationId: number,
): Promise<CountData> {
  const raw = await jsonRpc<RawCountData>('/stock_barcode/get_quants', {
    domain: [
      ['product_id', '=', productId],
      ['location_id', '=', locationId],
    ],
  });
  return toCountData(raw, {
    multiLocations: false,
    lots: false,
    packages: false,
    uom: false,
  });
}

/** ORM commands on quants, handled by `stock.quant.barcode_write`. */
export async function saveCountLines(
  commands: LineCommand[],
): Promise<CountData> {
  const raw = await jsonRpc<RawCountData>('/stock_barcode/save_barcode_data', {
    model: 'stock.quant',
    res_id: false,
    write_field: false,
    write_vals: commands,
  });
  return toCountData(raw, {
    multiLocations: false,
    lots: false,
    packages: false,
    uom: false,
  });
}

/** Applies the counted quantities (`stock.quant.action_validate`). */
export async function applyCount(quantIds: number[]): Promise<ValidateResult> {
  const result = await callKw<RawAction | boolean>(
    'stock.quant',
    'action_validate',
    [quantIds],
    {},
    45000,
  );
  if (result && typeof result === 'object' && result.res_model) {
    return { kind: 'action', model: result.res_model };
  }
  return { kind: 'done' };
}

/** Where a product is in stock (internal locations). */
export async function productStock(productId: number): Promise<StockLine[]> {
  const rows = await callKw<Raw[]>('stock.quant', 'search_read', [], {
    domain: [
      ['product_id', '=', productId],
      ['location_id.usage', '=', 'internal'],
    ],
    fields: ['location_id', 'lot_id', 'quantity', 'reserved_quantity'],
    order: 'location_id',
    limit: 100,
  });
  return rows.map(r => ({
    id: num(r.id),
    location: m2oName(r.location_id as Many2one) ?? '',
    lot: m2oName(r.lot_id as Many2one),
    quantity: num(r.quantity),
    reserved: num(r.reserved_quantity),
  }));
}

export async function getProduct(productId: number): Promise<Product | null> {
  const rows = await callKw<Raw[]>('product.product', 'read', [[productId]], {
    fields: PRODUCT_FIELDS,
    context: { display_default_code: false },
  });
  return rows[0] ? toProduct(rows[0]) : null;
}

export type ProductDetails = Product & {
  /** Full category path ("All / Alarm / Detectors"). */
  category: string | null;
  uom: string | null;
  type: 'consu' | 'service' | 'combo';
  salePrice: number;
  currency: string | null;
  /** Quantities over the company's warehouses, as Odoo's product form shows them. */
  onHand: number;
  free: number;
  incoming: number;
  outgoing: number;
  forecast: number;
};

const PRODUCT_DETAIL_FIELDS = [
  ...PRODUCT_FIELDS,
  'type',
  'categ_id',
  'lst_price',
  'currency_id',
  'qty_available',
  'free_qty',
  'incoming_qty',
  'outgoing_qty',
  'virtual_available',
];

export function toProductDetails(r: Raw): ProductDetails {
  const kind = r.type;
  return {
    ...toProduct(r),
    category: m2oName(r.categ_id as Many2one),
    uom: m2oName(r.uom_id as Many2one),
    type: kind === 'service' || kind === 'combo' ? kind : 'consu',
    salePrice: num(r.lst_price),
    currency: m2oName(r.currency_id as Many2one),
    onHand: num(r.qty_available),
    free: num(r.free_qty),
    incoming: num(r.incoming_qty),
    outgoing: num(r.outgoing_qty),
    forecast: num(r.virtual_available),
  };
}

/** Everything the product screen shows about one product. */
export async function getProductDetails(
  productId: number,
): Promise<ProductDetails | null> {
  const rows = await callKw<Raw[]>('product.product', 'read', [[productId]], {
    fields: PRODUCT_DETAIL_FIELDS,
    context: { display_default_code: false },
  });
  return rows[0] ? toProductDetails(rows[0]) : null;
}
