export type AccessibilityPreferences = {
  id: 'default';
  simpleMode: boolean;
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  updatedAt: string;
};

export type AccessibilityPreferenceKey = Exclude<keyof AccessibilityPreferences, 'id' | 'updatedAt'>;
