import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import LogoSpinner, { LogoSpinnerVariant } from './LogoSpinner';

type Props = {
  /** `mark` (default) shows only the "M"; `full` the whole logo. */
  variant?: LogoSpinnerVariant;
  /** Ring diameter in dp. */
  size?: number;
  /** Optional text under the spinner — pass a translated string. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A screen's loading state: fills its parent, themed background, the logo
 * spinner centred, optional label underneath.
 */
function LoadingView({ variant = 'mark', size = 72, label, style }: Props) {
  const theme = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background }, style]}
    >
      <LogoSpinner variant={variant} size={size} />
      {label ? (
        <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  label: {
    marginTop: 20,
    fontSize: 15,
    textAlign: 'center',
  },
});

export default LoadingView;
