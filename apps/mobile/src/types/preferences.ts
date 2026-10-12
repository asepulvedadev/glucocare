export type AccessibilityPreferences = {
  id: 'default';
  simpleMode: boolean;
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  notificationSound: boolean;
  notificationVibration: boolean;
  onboardingCompleted: boolean;
  updatedAt: string;
};

export type AccessibilityPreferenceKey = Exclude<keyof AccessibilityPreferences, 'id' | 'updatedAt'>;
