const env = typeof process !== 'undefined' ? process.env : undefined;

// Emergency routes are launch configuration, not universal medical advice.
// Each launch region must set its own number and review the copy.
export const emergencyConfig = {
  number: env?.EXPO_PUBLIC_EMERGENCY_NUMBER?.trim() || '123',
  region: env?.EXPO_PUBLIC_EMERGENCY_REGION?.trim() || 'Colombia',
};

export function getEmergencyConfig(card?: { emergencyNumber?: string; emergencyRegion?: string } | null) {
  return {
    number: card?.emergencyNumber?.trim() || emergencyConfig.number,
    region: card?.emergencyRegion?.trim() || emergencyConfig.region,
  };
}
