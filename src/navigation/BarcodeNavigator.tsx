import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { getSessionInfo } from '../api/barcode';
import type { SessionInfo } from '../api/barcode';
import { useOdooQuery } from '../hooks/useOdooQuery';
import { t } from '../i18n';
import CountScreen from '../screens/barcode/CountScreen';
import MenuScreen from '../screens/barcode/MenuScreen';
import OperationsScreen from '../screens/barcode/OperationsScreen';
import PickingListScreen from '../screens/barcode/PickingListScreen';
import PickingScreen from '../screens/barcode/PickingScreen';
import ProductScreen from '../screens/barcode/ProductScreen';
import ProductSearchScreen from '../screens/barcode/ProductSearchScreen';
import { Screen } from '../ui/primitives';
import { EASE_OUT, MOTION_MS, isReduceMotion } from '../ui/motion';
import StateView from '../ui/StateView';
import { useUi } from '../ui/theme';
import {
  BarcodeContext,
  BarcodeContextValue,
  BarcodeNav,
  BarcodeRoute,
  MenuTab,
  ScanHandler,
  ScannerInfo,
  errorText,
  isOffline,
  isSessionError,
} from './barcodeContext';

export type BarcodeNavigatorHandle = {
  /**
   * A code from the scanner: goes to the screen on top. `repeat`: the same
   * label read again moments later (not a new item).
   */
  deliver: (code: string, repeat?: boolean) => void;
  /** Android back; false when the stack is at its first screen. */
  back: () => boolean;
};

type Props = {
  scanner: ScannerInfo;
  /** Back from the first screen: leave the Barcode app. */
  onExit: () => void;
  /** Show a page of the Odoo web client instead. */
  onOpenOdoo: (path: string) => void;
  onSignIn: () => void;
  onOpenStatus: () => void;
};

type Entry = { key: number; route: BarcodeRoute };

/**
 * The app's own Barcode app: a small stack of native screens that does what
 * Odoo's Barcode app does, talking to Odoo through `src/api/barcode`.
 */
const BarcodeNavigator = forwardRef<BarcodeNavigatorHandle, Props>(
  function Navigator(
    { scanner, onExit, onOpenOdoo, onSignIn, onOpenStatus },
    ref,
  ) {
    const { c } = useUi();
    const keyRef = useRef(1);
    const [stack, setStack] = useState<Entry[]>([
      { key: 0, route: { name: 'menu' } },
    ]);
    const stackRef = useRef(stack);
    stackRef.current = stack;
    const directionRef = useRef<1 | -1>(1);

    const session = useOdooQuery<SessionInfo>(getSessionInfo);
    const [menuTab, setMenuTab] = useState<MenuTab | null>(null);

    const scanHandlerRef = useRef<ScanHandler | null>(null);
    const backHandlerRef = useRef<(() => boolean) | null>(null);
    const setScanHandler = useCallback((h: ScanHandler | null) => {
      scanHandlerRef.current = h;
    }, []);
    const setBackHandler = useCallback((h: (() => boolean) | null) => {
      backHandlerRef.current = h;
    }, []);

    const callbacks = useRef({ onExit, onOpenOdoo, onSignIn, onOpenStatus });
    callbacks.current = { onExit, onOpenOdoo, onSignIn, onOpenStatus };

    const nav = useMemo<BarcodeNav>(
      () => ({
        push: route => {
          directionRef.current = 1;
          setStack(s => [...s, { key: keyRef.current++, route }]);
        },
        replace: route => {
          directionRef.current = 1;
          setStack(s => [...s.slice(0, -1), { key: keyRef.current++, route }]);
        },
        pop: () => {
          if (stackRef.current.length <= 1) {
            callbacks.current.onExit();
            return;
          }
          directionRef.current = -1;
          // Two quick backs before a render: never pop the first screen.
          setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
        },
        openOdoo: path => callbacks.current.onOpenOdoo(path),
        signIn: () => callbacks.current.onSignIn(),
        openStatus: () => callbacks.current.onOpenStatus(),
      }),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        deliver: (code, repeat = false) =>
          scanHandlerRef.current?.(code, repeat),
        back: () => {
          if (backHandlerRef.current?.()) {
            return true;
          }
          if (stackRef.current.length > 1) {
            nav.pop();
            return true;
          }
          return false;
        },
      }),
      [nav],
    );

    const value = useMemo<BarcodeContextValue>(
      () => ({
        nav,
        scanner,
        session: session.data,
        setScanHandler,
        setBackHandler,
        menuTab,
        setMenuTab,
      }),
      [nav, scanner, session.data, setScanHandler, setBackHandler, menuTab],
    );

    const top = stack[stack.length - 1];
    const anim = useRef(new Animated.Value(1)).current;
    // Before paint: the new screen must not show at full opacity for a frame.
    useLayoutEffect(() => {
      anim.setValue(0);
      const a = Animated.timing(anim, {
        toValue: 1,
        duration: MOTION_MS,
        easing: EASE_OUT,
        useNativeDriver: true,
      });
      a.start();
      return () => a.stop();
    }, [top.key, anim]);

    if (!session.data) {
      const e = session.error;
      return (
        <Screen>
          {session.loading || !e ? (
            <StateView kind="loading" />
          ) : isSessionError(e) ? (
            <StateView
              kind="error"
              title={t('barcode.session.title')}
              body={t('barcode.session.body')}
              actionLabel={t('barcode.session.signIn')}
              onAction={onSignIn}
              secondaryLabel={t('common.back')}
              onSecondary={onExit}
            />
          ) : (
            <StateView
              kind={isOffline(e) ? 'offline' : 'error'}
              title={t('barcode.error.title')}
              body={errorText(e)}
              actionLabel={t('common.retry')}
              onAction={session.reload}
              secondaryLabel={t('common.back')}
              onSecondary={onExit}
            />
          )}
        </Screen>
      );
    }

    const offset = isReduceMotion() ? 0 : 36 * directionRef.current;
    return (
      <BarcodeContext.Provider value={value}>
        <View style={[styles.fill, { backgroundColor: c.bg }]}>
          <Animated.View
            key={top.key}
            style={[
              styles.fill,
              {
                opacity: anim,
                transform: [
                  {
                    translateX: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [offset, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {renderRoute(top.route)}
          </Animated.View>
        </View>
      </BarcodeContext.Provider>
    );
  },
);

function renderRoute(route: BarcodeRoute) {
  switch (route.name) {
    case 'menu':
      return <MenuScreen />;
    case 'operations':
      return <OperationsScreen code={route.code} />;
    case 'pickings':
      return (
        <PickingListScreen
          typeId={route.typeId}
          typeName={route.typeName}
          code={route.code}
        />
      );
    case 'picking':
      return <PickingScreen pickingId={route.id} />;
    case 'count':
      return <CountScreen />;
    case 'search':
      return <ProductSearchScreen />;
    case 'product':
      return <ProductScreen productId={route.id} title={route.title} />;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default BarcodeNavigator;
