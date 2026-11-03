import type { Product, ProductSearchFilter } from '../../api/barcode';

/** What the Find-a-product screen lists under "Recently viewed". */
export type RecentProduct = Pick<
  Product,
  'id' | 'name' | 'code' | 'barcode'
> & {
  category: string | null;
};

const MAX_RECENT = 8;

/**
 * Products opened this session, newest first. Kept in memory only: nothing
 * about products is written to the device.
 */
let recent: RecentProduct[] = [];

export function rememberProduct(p: RecentProduct) {
  const entry: RecentProduct = {
    id: p.id,
    name: p.name,
    code: p.code,
    barcode: p.barcode,
    category: p.category,
  };
  recent = [entry, ...recent.filter(r => r.id !== p.id)].slice(0, MAX_RECENT);
}

export function recentProducts(): RecentProduct[] {
  return recent;
}

export function clearRecentProducts() {
  recent = [];
}

export type SavedSearch = { query: string; filter: ProductSearchFilter };

/**
 * The search a product was opened from. The navigator only keeps the top
 * screen mounted, so Back from the product finds the search screen new: it
 * takes this to show the same results again.
 */
let saved: SavedSearch | null = null;

export function saveSearch(search: SavedSearch) {
  saved = search;
}

/** The saved search, once; a later visit from the menu starts empty. */
export function takeSavedSearch(): SavedSearch | null {
  const s = saved;
  saved = null;
  return s;
}
