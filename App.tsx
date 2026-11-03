import React, { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OdooWebViewScreen from './src/screens/OdooWebViewScreen';
import SplashScreen from './src/screens/SplashScreen';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  // Odoo loads behind the splash; the splash stays up until it has.
  const [odooReady, setOdooReady] = useState(false);
  const markOdooReady = useCallback(() => setOdooReady(true), []);

  return (
    <SafeAreaProvider>
      {/* The splash is always light: dark status bar icons until it is gone,
          then the Odoo screen matches the bar to the page. */}
      {splashDone ? null : <StatusBar barStyle="dark-content" />}
      {/* Odoo loads behind the splash, which fades out only once Odoo is ready. */}
      <View
        style={styles.fill}
        importantForAccessibility={splashDone ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!splashDone}
      >
        <OdooWebViewScreen active={splashDone} onReady={markOdooReady} />
      </View>
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
