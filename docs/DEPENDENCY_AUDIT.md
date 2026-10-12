# Dependency audit note

## Snapshot

- Date: 2026-10-12
- Project: `apps/mobile`
- Command: `npm audit --omit=dev`
- Reported: 29 advisories (18 high, 11 moderate, no critical)

The report is dominated by Expo/React Native build-tool transitive packages
(`@expo/cli`, Metro, `node-forge`, `xcode`, and related packages). The installed
runtime is Expo SDK 57 (`expo@57.0.28`, `react-native@0.86.3`), and `npm audit
fix --dry-run` proposes incompatible major downgrades such as `expo@44.0.6`,
`expo-router@58.0.17`, or `expo-sharing@14.0.8`. Those changes would violate the
Expo SDK compatibility contract and are not applied automatically.

## Decision

Keep the SDK-pinned lockfile, exclude these build-tool advisories from any claim
that the release is vulnerability-free, and review every Expo SDK upgrade with
`expo-doctor`, native builds, and the device matrix. No critical advisory is
reported. Production authorization remains blocked until security ownership
reviews the upstream advisories and approves either a compatible patch or a
documented exception.

## Recheck

```bash
cd apps/mobile
npm ci --legacy-peer-deps
npx expo-doctor
npm audit --omit=dev
```
