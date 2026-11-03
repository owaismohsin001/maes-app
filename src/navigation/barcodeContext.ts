import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { OperationCode, SessionInfo } from '../api/barcode';
import { OdooError } from '../api/odoo';
import { t } from '../i18n';
import { rejectFeedback } from '../ui/scanFeedback';
import type { ScannerUiState, ScanMessage } from '../ui/scanFeedback';
import type { Tone } from '../ui/theme';

export type BarcodeRoute =
  | { name: 'menu' }
  /** One kind (receipts, deliveries, internal transfers) in every warehouse. */
  | { name: 'operations'; code: OperationCode }
  | { name: 'pickings'; typeId: number; typeName: string; code: OperationCode }
  | { name: 'picking'; id: number }
  | { name: 'count' }
  /** Find a product by name, reference or barcode. */
  | { name: 'search' }
  | { name: 'product'; id: number; title: string };

export type BarcodeNav = {
  push: (route: BarcodeRoute) => void;
  replace: (route: BarcodeRoute) => void;
  /** Back one screen (the first screen: leave the Barcode app). */
  pop: () => void;
  /** Open a page of the Odoo web client (leaves the native screens). */
  openOdoo: (path: string) => void;
  /** Session gone: sign in again in the WebView. */
  signIn: () => void;
  openStatus: () => void;
};

export type ScannerInfo = {
  state: ScannerUiState;
  problemText?: string;
  restart: () => void;
};

/** The Barcode home's tabs. */
export type MenuTab = 'scanner' | 'menu';

/** `repeat`: the same label read again moments later, not a new item. */
export type ScanHandler = (code: string, repeat: boolean) => void;

export type BarcodeContextValue = {
  nav: BarcodeNav;
  scanner: ScannerInfo;
  session: SessionInfo | null;
  /** The top screen's scan handler. */
  setScanHandler: (handler: ScanHandler | null) => void;
  /** The top screen's Android-back handler; return true when handled. */
  setBackHandler: (handler: (() => boolean) | null) => void;
  /**
   * The home tab the user chose (null: not yet), kept here because the home
   * screen unmounts while another screen is on top.
   */
  menuTab: MenuTab | null;
  setMenuTab: (tab: MenuTab) => void;
};

export const BarcodeContext = createContext<BarcodeContextValue | null>(null);

export function useBarcode(): BarcodeContextValue {
  const value = useContext(BarcodeContext);
  if (!value) {
    throw new Error('useBarcode outside BarcodeNavigator');
  }
  return value;
}

/** Receives every scan while this screen is on top. */
export function useScanHandler(handler: ScanHandler) {
  const { setScanHandler } = useBarcode();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    setScanHandler((code, repeat) => ref.current(code, repeat));
    return () => setScanHandler(null);
  }, [setScanHandler]);
}

/** Intercepts Android back while this screen is on top. */
export function useBackHandler(handler: () => boolean) {
  const { setBackHandler } = useBarcode();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    setBackHandler(() => ref.current());
    return () => setBackHandler(null);
  }, [setBackHandler]);
}

/** The scan toast's message plus helpers to show one. */
export function useScanMessages() {
  const [message, setMessage] = useState<ScanMessage | null>(null);
  const counter = useRef(0);
  const show = useCallback((tone: Tone, text: string) => {
    if (tone === 'danger' || tone === 'warning') {
      rejectFeedback();
    }
    setMessage({ id: ++counter.current, tone, text });
  }, []);
  return { message, show };
}

/** User-facing text for an Odoo call that failed. */
export function errorText(e: unknown): string {
  if (e instanceof OdooError) {
    switch (e.kind) {
      case 'network':
        return t('barcode.error.offline');
      case 'timeout':
        return t('barcode.error.timeout');
      case 'session':
        return t('barcode.error.session');
      case 'access':
        return t('barcode.error.access');
      case 'user':
        return e.message;
      default:
        return t('barcode.error.server');
    }
  }
  return t('barcode.error.server');
}

export function isOffline(e: unknown): boolean {
  return (
    e instanceof OdooError && (e.kind === 'network' || e.kind === 'timeout')
  );
}

export function isSessionError(e: unknown): boolean {
  return e instanceof OdooError && e.kind === 'session';
}
