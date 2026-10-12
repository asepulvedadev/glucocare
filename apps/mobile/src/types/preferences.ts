export type AccessibilityPreferences = {
  id: 'default';
  simpleMode: boolean;
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  onboardingCompleted: boolean;
  updatedAt: string;
};

export type AccessibilityPreferenceKey = Exclude<keyof AccessibilityPreferences, 'id' | 'updatedAt'>;
