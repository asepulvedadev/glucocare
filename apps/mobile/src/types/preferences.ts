import type { GlucoseUnit } from './domain';

export type AccessibilityPreferences = {
  id: 'default';
  simpleMode: boolean;
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  notificationSound: boolean;
  notificationVibration: boolean;
  appLockEnabled: boolean;
  onboardingCompleted: boolean;
  glucoseUnit: GlucoseUnit;
  updatedAt: string;
};

export type AccessibilityPreferenceKey = Exclude<keyof AccessibilityPreferences, 'id' | 'updatedAt' | 'glucoseUnit'>;
