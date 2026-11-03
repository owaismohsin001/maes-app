import { useColorScheme } from 'react-native';

export type Theme = {
  background: string;
  text: string;
  textMuted: string;
  /** Brand ink: the logo PNGs are black, tint them with this. */
  logo: string;
};

export const lightTheme: Theme = {
  background: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  logo: '#000000',
};

export const darkTheme: Theme = {
  background: '#070B14',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  logo: '#FFFFFF',
};

/** The light or dark palette, following the system colour scheme. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
