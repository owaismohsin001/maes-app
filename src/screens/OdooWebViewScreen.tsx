import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type {
  WebViewNavigation,
  WebViewNavigationEvent,
  WebViewOpenWindowEvent,
} from 'react-native-webview/lib/WebViewTypes';
import LoadingView from '../components/LoadingView';
import ScannerOverlay from '../components/ScannerOverlay';
import { ODOO_ORIGIN, ODOO_WEB_URL } from '../config';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useTheme } from '../hooks/useTheme';
import { useWebViewBackHandler } from '../hooks/useWebViewBackHandler';
import { t } from '../i18n';
import {
  ODOO_PAGE_SCRIPT,
  PageColors,
  isLightColor,
  isPageReadyMessage,
  parsePageColorsMessage,
  parsePageHistoryMessage,
} from '../utils/odooPageScript';
import { nativeScanner } from '../scanner/scanner';
import {
  ODOO_SCANNER_PAGE_SCRIPT,
  isOpenScannerMessage,
  odooBarcodeScript,
  parsePageUrlMessage,
} from '../utils/odooBarcodeScript';
import { isAuthPage, isBarcodeAppUrl, isOdooUrl } from '../utils/odooUrl';

// The library's class type defaults its extra-props parameter to `undefined`,
// which turns every prop into `never`; pin it to `object`.
type WebViewRef = WebView<object>;

type Props = {
  /**
   * Whether this screen controls the status bar. False while the splash
   * covers it (the splash keeps its own dark icons).
   */
  active?: boolean;
  /**
   * Called once, when the first page can be shown: it has loaded and rendered
   * (page script), or failed (the error screen is ready), or 6 s after its
   * load event as a fallback.
   */
  onReady?: () => void;
};

const READY_FALLBACK_MS = 6000;

/** Back from the scanner screen: load Odoo's start page if history hasn't left the Barcode app by then. */
export const LEAVE_BARCODE_FALLBACK_MS = 1500;

// With the handheld's scanner module, pages also report their URL and hand
// Odoo's own scan buttons over to the app's scanner screen.
const PAGE_SCRIPT = nativeScanner
  ? `${ODOO_PAGE_SCRIPT}\n${ODOO_SCANNER_PAGE_SCRIPT}`
  : ODOO_PAGE_SCRIPT;

/**
 * The Odoo web client, full screen, behaving like native screens: Android back
 * walks back through the pages (see `useWebViewBackHandler`), iOS gets the
 * swipe-back gesture. The status bar and navigation bar areas take the colour
 * of the page edge behind them. While Odoo's Barcode app is open, the app's
 * scanner screen covers it (see `ScannerOverlay`).
 */
function OdooWebViewScreen({ active = true, onReady }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const webViewRef = useRef<WebViewRef>(null);
  const lastPageWasAuthRef = useRef<boolean | null>(null);
  // Bumped to remount the WebView after Android kills its renderer process.
  const [instance, setInstance] = useState(0);
  // Colours at the page's top and bottom edge; null until the page reports them.
  const [pageColors, setPageColors] = useState<PageColors | null>(null);
  const topColor = pageColors?.top ?? theme.background;
  const bottomColor = pageColors?.bottom ?? theme.background;

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyRef = useRef(false);
  const readyFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReady = useCallback(() => {
    if (readyFallbackRef.current) {
      clearTimeout(readyFallbackRef.current);
      readyFallbackRef.current = null;
    }
    if (!readyRef.current) {
      readyRef.current = true;
      onReadyRef.current?.();
    }
  }, []);
  useEffect(
    () => () => {
      if (readyFallbackRef.current) {
        clearTimeout(readyFallbackRef.current);
      }
    },
    [],
  );
  const onLoadEnd = useCallback(() => {
    if (!readyRef.current && !readyFallbackRef.current) {
      readyFallbackRef.current = setTimeout(markReady, READY_FALLBACK_MS);
    }
  }, [markReady]);

  const history = useWebViewBackHandler(webViewRef, t('web.exitHint'));

  // Where the page is: from load events and the page's own reports (Odoo
  // navigates in-page, without loads).
  const [pageUrl, setPageUrl] = useState(ODOO_WEB_URL);
  const inBarcodeApp = isBarcodeAppUrl(pageUrl);
  // The scanner screen takes the place of Odoo's Barcode app: it opens when
  // the app does and closes when the app is left.
  const [scannerOpen, setScannerOpen] = useState(false);
  useEffect(() => {
    setScannerOpen(inBarcodeApp);
  }, [inBarcodeApp]);

  // Back on the scanner screen leaves the Barcode app for the page before it
  // (normally the apps menu), one history step at a time if the app went
  // deeper. The scanner screen stays up until Odoo is out of the app, so the
  // app's own screens never flash up; if history doesn't get there, Odoo's
  // start page is loaded instead.
  const [leavingBarcode, setLeavingBarcode] = useState(false);
  const backFromUrlRef = useRef<string | null>(null);
  const leaveBarcodeApp = useCallback(() => setLeavingBarcode(true), []);
  useEffect(() => {
    if (!leavingBarcode) {
      return;
    }
    if (!inBarcodeApp) {
      setLeavingBarcode(false);
      backFromUrlRef.current = null;
      return;
    }
    if (backFromUrlRef.current !== pageUrl) {
      backFromUrlRef.current = pageUrl;
      webViewRef.current?.goBack();
    }
    const fallback = setTimeout(() => {
      webViewRef.current?.injectJavaScript(
        `window.location.assign(${JSON.stringify(ODOO_WEB_URL)});true;`,
      );
    }, LEAVE_BARCODE_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [leavingBarcode, inBarcodeApp, pageUrl]);
  const coveredByScanner = scannerOpen && nativeScanner != null;

  // Signing in or out starts a fresh history, so back never returns to the
  // login form after signing in, nor into Odoo screens after signing out.
  const onLoad = useCallback(
    (e: WebViewNavigationEvent) => {
      history.onPageLoaded(e.nativeEvent.canGoBack);
      setPageUrl(e.nativeEvent.url);
      const auth = isAuthPage(e.nativeEvent.url);
      const previous = lastPageWasAuthRef.current;
      lastPageWasAuthRef.current = auth;
      if (previous !== null && previous !== auth) {
        webViewRef.current?.clearHistory?.();
        history.onHistoryCleared();
      }
    },
    [history],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      history.onNavigationActivity();
      setPageUrl(nav.url);
    },
    [history],
  );

  // Links that open a new tab/window: Odoo pages stay in the app (in a new
  // window they would lose the session); anything else goes to the system.
  const onOpenWindow = useCallback((e: WebViewOpenWindowEvent) => {
    const url = e.nativeEvent.targetUrl;
    if (isOdooUrl(url)) {
      webViewRef.current?.injectJavaScript(
        `window.location.assign(${JSON.stringify(url)});true;`,
      );
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const data = e.nativeEvent.data;
      if (isPageReadyMessage(data)) {
        markReady();
        return;
      }
      const canGoBack = parsePageHistoryMessage(data);
      if (canGoBack !== null) {
        history.onPageHistory(canGoBack);
        return;
      }
      const colors = parsePageColorsMessage(data);
      if (colors) {
        setPageColors(prev =>
          prev?.top === colors.top && prev?.bottom === colors.bottom
            ? prev
            : colors,
        );
        return;
      }
      const url = parsePageUrlMessage(data);
      if (url !== null) {
        setPageUrl(url);
        return;
      }
      if (isOpenScannerMessage(data)) {
        setScannerOpen(true);
      }
    },
    [markReady, history],
  );

  // A code read on Odoo's own screens (side button) goes to the page as if a
  // USB scanner had typed it.
  const deliverCode = useCallback((code: string) => {
    webViewRef.current?.injectJavaScript(odooBarcodeScript(code));
  }, []);

  // The app's Barcode screens hand over to the web client: a record or wizard
  // they can't show, or the login page when the session has ended (Odoo
  // brings the user back to the Barcode app after signing in).
  const openOdooPath = useCallback((path: string) => {
    webViewRef.current?.injectJavaScript(
      `window.location.assign(${JSON.stringify(
        `${ODOO_ORIGIN}${path}`,
      )});true;`,
    );
  }, []);
  const signIn = useCallback(
    () => openOdooPath('/web/login?redirect=%2Fodoo%2Fbarcode'),
    [openOdooPath],
  );

  // A failed load shows the error screen: theme colours, and the splash may go.
  const onError = useCallback(() => {
    setPageColors(null);
    markReady();
  }, [markReady]);
  const reload = useCallback(() => webViewRef.current?.reload(), []);
  const remount = useCallback(() => {
    setPageColors(null);
    setInstance(i => i + 1);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {active ? (
        <StatusBar
          animated
          barStyle={
            isLightColor(coveredByScanner ? theme.background : topColor)
              ? 'dark-content'
              : 'light-content'
          }
        />
      ) : null}
      <View
        testID="top-inset"
        style={{ height: insets.top, backgroundColor: topColor }}
      />
      <WebView<object>
        key={instance}
        ref={webViewRef}
        source={{ uri: ODOO_WEB_URL }}
        // Hide the website footer and report edge colours: as early as
        // possible, and again after load in case the early run landed before
        // the new document existed (the script runs once per document).
        injectedJavaScriptBeforeContentLoaded={PAGE_SCRIPT}
        injectedJavaScript={PAGE_SCRIPT}
        onMessage={onMessage}
        onError={onError}
        onLoadEnd={onLoadEnd}
        style={{ backgroundColor: theme.background }}
        startInLoadingState
        renderLoading={() => <LoadingView style={StyleSheet.absoluteFill} />}
        renderError={() => <ErrorView onRetry={reload} />}
        // For the back handler only "something is navigating" signals: the
        // canGoBack they carry is stale for in-page navigation on Android.
        // The URL is right, though, and tracked for the scanner screen.
        onNavigationStateChange={onNavigationStateChange}
        onLoadProgress={history.onNavigationActivity}
        onLoad={onLoad}
        onOpenWindow={onOpenWindow}
        onRenderProcessGone={remount}
        onContentProcessDidTerminate={reload}
        allowsBackForwardNavigationGestures
        domStorageEnabled
        webviewDebuggingEnabled={__DEV__}
      />
      <View
        testID="bottom-inset"
        style={{
          height: insets.bottom + keyboardHeight,
          backgroundColor: bottomColor,
        }}
      />
      <ScannerOverlay
        open={scannerOpen}
        leaving={leavingBarcode}
        onBack={leaveBarcodeApp}
        onCode={deliverCode}
        onOpenOdoo={openOdooPath}
        onSignIn={signIn}
      />
    </View>
  );
}

function ErrorView({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.error,
        { backgroundColor: theme.background },
      ]}
    >
      <Text style={[styles.errorTitle, { color: theme.text }]}>
        {t('web.errorTitle')}
      </Text>
      <Text style={[styles.errorBody, { color: theme.textMuted }]}>
        {t('web.errorBody')}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.retry,
          { borderColor: theme.text, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[styles.retryText, { color: theme.text }]}>
          {t('common.retry')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  error: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBody: {
    marginTop: 8,
    fontSize: 15,
    textAlign: 'center',
  },
  retry: {
    marginTop: 24,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 24,
    borderWidth: 1.5,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OdooWebViewScreen;
