import React, { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppControl } from './src/control/useAppControl';
import LockScreen from './src/screens/LockScreen';
import OdooWebViewScreen from './src/screens/OdooWebViewScreen';
import SplashScreen from './src/screens/SplashScreen';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  // Odoo loads behind the splash; the splash stays up until it has.
  const [odooReady, setOdooReady] = useState(false);
  const markOdooReady = useCallback(() => setOdooReady(true), []);
  // May the app run on this device now (allowed in Odoo, app on, right place)?
  // Anything but 'allowed' covers Odoo with the lock screen and mutes the scanner.
  const control = useAppControl();
  const allowed = control.phase === 'allowed';

  return (
    <SafeAreaProvider>
      {/* The splash is always light: dark status bar icons until it is gone,
          then the Odoo screen matches the bar to the page. */}
      {splashDone ? null : <StatusBar barStyle="dark-content" />}
      {/* Odoo loads behind the splash, which fades out only once Odoo is ready. */}
      <View
        style={styles.fill}
        importantForAccessibility={
          splashDone && allowed ? 'auto' : 'no-hide-descendants'
        }
        accessibilityElementsHidden={!splashDone || !allowed}
      >
        <OdooWebViewScreen
          active={splashDone}
          onReady={markOdooReady}
          scanEnabled={allowed}
        />
      </View>
      {allowed ? null : <LockScreen control={control} />}
      {splashDone ? null : (
        <View style={StyleSheet.absoluteFill}>
          <SplashScreen ready={odooReady} onFinish={finishSplash} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

export default App;
