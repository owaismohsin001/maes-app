import { useMemo } from 'react';
import { TextStyle, useColorScheme } from 'react-native';

/**
 * MaesApp's design tokens for native screens (see `.claude/skills/maes-ui`).
 * Screens use `useUi()` and never hard-code colours, sizes or spacing.
 */

export type Colors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Brand ink: black on light, white on dark. */
  brand: string;
  onBrand: string;
  /** Accent (Odoo 19's brand purple): icons, selected / current markers. */
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  /** Text and icons on a filled `success` background. */
  onSuccess: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
  /** Behind a camera picture: dark in both themes. */
  media: string;
  /** Text and icons on `media`. */
  onMedia: string;
  /** Frame around the scanner's picture. */
  scanFrame: string;
};

export const lightColors: Colors = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#E2E5EA',
  text: '#0B0F17',
  textMuted: '#5B6472',
  textFaint: '#8A929E',
  brand: '#0B0F17',
  onBrand: '#FFFFFF',
  accent: '#714B67',
  accentSoft: '#F1ECF0',
  success: '#15803D',
  successSoft: '#E3F4E8',
  onSuccess: '#FFFFFF',
  warning: '#B45309',
  warningSoft: '#FDF0DC',
  danger: '#C62828',
  dangerSoft: '#FBE5E5',
  info: '#1D4ED8',
  infoSoft: '#E4ECFC',
  overlay: 'rgba(11, 15, 23, 0.45)',
  media: '#0B0F17',
  onMedia: '#FFFFFF',
  scanFrame: '#E53935',
};

export const darkColors: Colors = {
  bg: '#070B14',
  surface: '#111723',
  surfaceAlt: '#1A2130',
  border: '#252D3D',
  text: '#F4F6F9',
  textMuted: '#A3ABB8',
  textFaint: '#6F7887',
  brand: '#F4F6F9',
  onBrand: '#0B0F17',
  accent: '#C9A3BF',
  accentSoft: '#2C2029',
  success: '#4ADE80',
  successSoft: '#12291B',
  onSuccess: '#0B0F17',
  warning: '#FBBF24',
  warningSoft: '#2D2310',
  danger: '#F87171',
  dangerSoft: '#311618',
  info: '#93B4FD',
  infoSoft: '#16213B',
  overlay: 'rgba(0, 0, 0, 0.6)',
  media: '#000000',
  onMedia: '#FFFFFF',
  scanFrame: '#F05252',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  mono: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: tabular,
  },
} satisfies Record<string, TextStyle>;

export type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'accent';

/** Foreground and soft background colour of a status tone. */
export function toneColors(c: Colors, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'success':
      return { fg: c.success, bg: c.successSoft };
    case 'warning':
      return { fg: c.warning, bg: c.warningSoft };
    case 'danger':
      return { fg: c.danger, bg: c.dangerSoft };
    case 'info':
      return { fg: c.info, bg: c.infoSoft };
    case 'accent':
      return { fg: c.accent, bg: c.accentSoft };
    default:
      return { fg: c.textMuted, bg: c.surfaceAlt };
  }
}

export type Ui = {
  c: Colors;
  s: typeof spacing;
  r: typeof radius;
  type: typeof typography;
  dark: boolean;
};

/** The tokens for the current colour scheme. */
export function useUi(): Ui {
  const dark = useColorScheme() === 'dark';
  return useMemo(
    () => ({
      c: dark ? darkColors : lightColors,
      s: spacing,
      r: radius,
      type: typography,
      dark,
    }),
    [dark],
  );
}
