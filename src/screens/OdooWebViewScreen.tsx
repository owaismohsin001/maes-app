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
import { ODOO_WEB_URL } from '../config';
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
import { useHandheldScanner } from '../scanner/useHandheldScanner';
import { odooBarcodeScript } from '../utils/odooBarcodeScript';
import { isAuthPage, isOdooUrl } from '../utils/odooUrl';

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
  /**
   * False while the app is locked (app control, see `useAppControl`): the
   * handheld's reads are dropped instead of typed into the hidden page.
   */
  scanEnabled?: boolean;
};

const READY_FALLBACK_MS = 6000;

/**
 * The Odoo web client, full screen, behaving like native screens: Android back
 * walks back through the pages (see `useWebViewBackHandler`), iOS gets the
 * swipe-back gesture. The status bar and navigation bar areas take the colour
 * of the page edge behind them. That is the whole app: the handheld's CM60
 * scanner (side button) types each read into the page like a keyboard-wedge
 * scanner (`useHandheldScanner`). Nothing is drawn over Odoo.
 */
function OdooWebViewScreen({
  active = true,
  onReady,
  scanEnabled = true,
}: Props) {
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

  // A read goes into the page as real key presses (the WebView sees a
  // keyboard-wedge scanner); the page script is the fallback when that can't
  // be done (no WebView on screen, a character without a key).
  const deliverCode = useCallback((code: string) => {
    const viaScript = () =>
      webViewRef.current?.injectJavaScript(odooBarcodeScript(code));
    if (!nativeScanner) {
      viaScript();
      return;
    }
    nativeScanner.typeText(code).then(typed => {
      if (!typed) {
        viaScript();
      }
    }, viaScript);
  }, []);

  useHandheldScanner(deliverCode, scanEnabled);

  // Signing in or out starts a fresh history, so back never returns to the
  // login form after signing in, nor into Odoo screens after signing out.
  const onLoad = useCallback(
    (e: WebViewNavigationEvent) => {
      history.onPageLoaded(e.nativeEvent.canGoBack);
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
    (_nav: WebViewNavigation) => {
      history.onNavigationActivity();
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
      }
    },
    [markReady, history],
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
          barStyle={isLightColor(topColor) ? 'dark-content' : 'light-content'}
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
        injectedJavaScriptBeforeContentLoaded={ODOO_PAGE_SCRIPT}
        injectedJavaScript={ODOO_PAGE_SCRIPT}
        onMessage={onMessage}
        onError={onError}
        onLoadEnd={onLoadEnd}
        style={{ backgroundColor: theme.background }}
        startInLoadingState
        renderLoading={() => <LoadingView style={StyleSheet.absoluteFill} />}
        renderError={() => <ErrorView onRetry={reload} />}
        // For the back handler only "something is navigating" signals: the
        // canGoBack they carry is stale for in-page navigation on Android.
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
