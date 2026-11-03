import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logoFull as logo } from '../assets/logo';
import { useTheme } from '../hooks/useTheme';
import { t } from '../i18n';

// Placeholder until the first real feature (scanner) lands.
function HomeScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <Image
        source={logo}
        resizeMode="contain"
        fadeDuration={0}
        accessibilityRole="image"
        accessibilityLabel="MAES Security"
        style={[styles.logo, { tintColor: theme.logo }]}
      />
      <Text style={[styles.title, { color: theme.text }]}>
        {t('home.title')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        {t('home.subtitle')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 160,
    height: 96,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
  },
});

export default HomeScreen;
