import { Appearance } from 'react-native';

const darkColors = {
  canvas: '#0B0D0F',
  surface: '#14181B',
  surfaceRaised: '#1C2226',
  textPrimary: '#FFF7E8',
  textSecondary: '#B8B2A7',
  textDisabled: '#77736C',
  amber: '#FFBE55',
  amberDeep: '#F5A623',
  teal: '#38D39F',
  attention: '#F5A623',
  urgent: '#C94B43',
  info: '#75B7D8',
  border: '#2A3135',
} as const;

const lightColors = {
  canvas: '#FFF9EF',
  surface: '#FFFFFF',
  surfaceRaised: '#F2EBDD',
  textPrimary: '#171717',
  textSecondary: '#514B43',
  textDisabled: '#77736C',
  amber: '#9A5F00',
  amberDeep: '#C17A00',
  teal: '#087A5A',
  attention: '#A85F00',
  urgent: '#B83C36',
  info: '#23617D',
  border: '#D8D0C4',
} as const;

export const isLightTheme = Appearance.getColorScheme() === 'light';
export const colors = isLightTheme ? lightColors : darkColors;

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;
