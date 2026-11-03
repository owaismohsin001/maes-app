import { RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';

/** A second back press within this window closes the app. */
export const EXIT_CONFIRM_WINDOW_MS = 2000;

/**
 * After back calls `goBack()`, some navigation sign must arrive within this
 * time; otherwise the WebView had nothing to go back to after all.
 */
export const BACK_WATCHDOG_MS = 1000;

/** What the screen tells the back handler about the WebView's history. */
export type WebViewHistoryEvents = {
  /** A page finished loading; native `canGoBack` is reliable at this point. */
  onPageLoaded: (canGoBack: boolean) => void;
  /** The page's own view of its history (Navigation API, via the page script). */
  onPageHistory: (canGoBack: boolean) => void;
  /** Any sign of navigation (start, progress, history change). */
  onNavigationActivity: () => void;
  /** The WebView's history was cleared. */
  onHistoryCleared: () => void;
};

/**
 * Android hardware/gesture back for a full-screen WebView, like a stack of
 * native screens: back goes to the previous page, including Odoo's in-app
 * screens. On the first page, the first press only shows `exitHint`; a second
 * press within 2 s lets Android close the app.
 *
 * Why not just `onNavigationStateChange`'s `canGoBack`: for in-page (pushState)
 * navigation, Android reports it before the new history entry is committed, so
 * it says `false` on Odoo screens that do have a previous screen. Hence two
 * sources (native value at page finish, the page's Navigation API) plus a
 * watchdog in case both are wrong.
 */
export function useWebViewBackHandler(
  webViewRef: RefObject<{ goBack: () => void } | null>,
  exitHint: string,
): WebViewHistoryEvents {
  const nativeCanGoBackRef = useRef(false);
  const pageCanGoBackRef = useRef(false);
  const lastRootPressRef = useRef(Number.NEGATIVE_INFINITY);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const showExitHint = useCallback(() => {
    lastRootPressRef.current = Date.now();
    if (Platform.OS === 'android') {
      ToastAndroid.show(exitHint, ToastAndroid.SHORT);
    }
  }, [exitHint]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        const webView = webViewRef.current;
        if (
          webView &&
          (nativeCanGoBackRef.current || pageCanGoBackRef.current)
        ) {
          webView.goBack();
          cancelWatchdog();
          watchdogRef.current = setTimeout(() => {
            // Nothing navigated: this was the first page after all.
            watchdogRef.current = null;
            nativeCanGoBackRef.current = false;
            pageCanGoBackRef.current = false;
            showExitHint();
          }, BACK_WATCHDOG_MS);
          return true;
        }

        if (Date.now() - lastRootPressRef.current < EXIT_CONFIRM_WINDOW_MS) {
          return false; // second press: default behaviour, the app closes
        }
        showExitHint();
        return true;
      },
    );
    return () => {
      subscription.remove();
      cancelWatchdog();
    };
  }, [webViewRef, cancelWatchdog, showExitHint]);

  return useMemo(
    () => ({
      onPageLoaded: (canGoBack: boolean) => {
        cancelWatchdog();
        nativeCanGoBackRef.current = canGoBack;
      },
      onPageHistory: (canGoBack: boolean) => {
        cancelWatchdog();
        pageCanGoBackRef.current = canGoBack;
      },
      onNavigationActivity: cancelWatchdog,
      onHistoryCleared: () => {
        nativeCanGoBackRef.current = false;
        pageCanGoBackRef.current = false;
      },
    }),
    [cancelWatchdog],
  );
}
