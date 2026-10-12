# GlucoCare mobile

Expo SDK 57 mobile-first application for the GlucoCare self-management companion.

## Implemented vertical slice

- Expo Router navigation: Today, History, Care, Profile, Help.
- Atmos-inspired dark amber visual tokens.
- Accessible 44 pt touch targets, labels, semantic status colors, and large readable values.
- Offline glucose entry backed by SQLite, automatic timestamp, unit, context, symptoms, and notes.
- Local history persisted across app restarts.
- Emergency help flow that opens the local emergency number and states delivery limitations.
- Medication records with clinician-provided dose text, route, daily time, and local reminder state.
- Native daily reminder scheduling with explicit permission-denied and web-unavailable states.
- Local emergency card and consented trusted contacts.
- Help-event recording with an explicit call fallback; alert delivery is never overstated.
- JSON bundle and glucose CSV export, plus local data deletion with scheduled-reminder cleanup.
- SQLCipher config enabled for native builds; web SQLite uses the documented WASM/COOP/COEP setup.

## Commands

```bash
npm install --legacy-peer-deps
npm run typecheck
npm run lint
npx expo-doctor
npx expo start
npx expo export --platform web
```

Use a development build for native modules and notifications. Expo Go is useful for early UI review but is not the release artifact.

## Safety boundary

This app records and organizes user-provided information. It does not diagnose, prescribe, calculate insulin doses, or guarantee that an emergency notification is delivered.
