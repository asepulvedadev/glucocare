# GlucoCare mobile design system

GlucoCare uses the **visual grammar of the Atmos Weather reference**—a dark, cinematic surface, warm amber energy, rounded device-like cards, oversized confident type, and a single luminous focal element—but translates it into a calm, accessible, first-mobile health experience. This is inspiration, not a pixel clone: no copied assets, copy, or weather-specific imagery.

Reference reviewed: [Atmos Weather App Landing Page Template](https://atmos-weather.aura.build/).

## Quick path

1. Build and test at `390 × 844 pt` first; treat `375 × 812 pt` as the minimum supported design width.
2. Implement the Today screen before secondary screens.
3. Use the tokens and component rules below; do not introduce ad-hoc colors or spacing.
4. Validate every critical flow with large text, TalkBack, VoiceOver, reduced motion, and offline state.

## Design direction

### Atmos cues we retain

| Reference cue | GlucoCare translation |
|---|---|
| Black, almost-cinematic hero | Deep graphite app canvas that reduces glare and gives the current health action visual priority. |
| Warm yellow outer frame | Warm amber accent used for focus, progress, and the next action—not as a universal health status. |
| Vertical glowing energy column | A restrained “care pulse” gradient in the Today header; static fallback for reduced motion. |
| Floating phone mockup | Layered cards and one primary reading card; no decorative phone frame inside the actual mobile app. |
| White oversized headline | Short, plain-language screen titles with a strong hierarchy. |
| Rounded black navigation bar | A compact bottom tab bar with four destinations and a separate persistent Get help action. |

### What we deliberately do not copy

- No weather/radar metaphors for medical danger.
- No neon glow behind values that users must read quickly.
- No glassmorphism over critical text if contrast is uncertain.
- No full-screen animation, parallax, or decorative pulse during an urgent state.
- No red/green-only interpretation of glucose status.

## Product mood

**Calm vigilance:** premium enough to feel cared for, restrained enough to be trustworthy, and plain enough to use while tired or disoriented.

Keywords: `quiet`, `warm`, `grounded`, `high-contrast`, `reassuring`, `precise`.

## First-mobile layout rules

### Target frames

| Frame | Purpose |
|---|---|
| `390 × 844` | Primary design and screenshot baseline. |
| `375 × 812` | Minimum supported compact phone. |
| `430 × 932` | Large phone validation. |
| `768+` | Web/tablet adaptation only; do not redesign mobile navigation around desktop. |

### Safe areas and geometry

- Wrap every route in a safe-area-aware root.
- Horizontal content inset: `20 pt` on compact phones, never below `16 pt`.
- Use an `8 pt` spacing grid: `4, 8, 12, 16, 24, 32, 40`.
- Primary cards: `20 pt` radius; compact controls: `14 pt` radius; pill only for tags/status.
- Minimum interactive target: `48 × 48 pt`; use hit slop for small icon controls.
- Keep the primary action above the fold whenever possible.
- Do not use horizontal scrolling for critical information.
- Bottom tab content must include enough bottom inset for the home indicator.

### Density

Prefer one strong card per viewport over a dashboard wall. A user should understand the next safe action without scanning more than three visual groups.

## Color system

The palette is intentionally warm and dark like Atmos, but status colors are independent semantic tokens. Never communicate a clinical state through color alone.

### Core tokens

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#0B0D0F` | App background; not pure black. |
| `surface` | `#14181B` | Primary cards and bottom bar. |
| `surfaceRaised` | `#1C2226` | Focused cards, sheets, and input wells. |
| `textPrimary` | `#FFF7E8` | Main text and values. |
| `textSecondary` | `#B8B2A7` | Supporting copy, timestamps, helper text. |
| `textDisabled` | `#77736C` | Disabled only; never for required information. |
| `amber` | `#FFBE55` | Primary action, focus, progress, active tab. |
| `amberDeep` | `#F5A623` | Gradient midpoint and decorative glow. |
| `teal` | `#38D39F` | In-range/confirmed state with text label. |
| `attention` | `#F5A623` | Needs attention; pair with label/icon. |
| `urgent` | `#C94B43` | Emergency action and urgent state. |
| `info` | `#75B7D8` | Informational state, not “safe.” |
| `outline` | `rgba(255,247,232,0.14)` | Hairline borders and dividers. |

### Contrast decisions

- `textPrimary` on `canvas`: approximately `18:1`.
- `textSecondary` on `canvas`: approximately `9:1`.
- Dark text on `amber`: approximately `12:1`.
- Dark text on `teal`: approximately `10:1`.
- White text on `urgent`: approximately `4.6:1`; use bold/large label text for the emergency button and verify on-device.
- Do not use amber text on a white/light surface without a dedicated contrast check.

### Light theme

Light mode is supported for accessibility and daylight use. It is not a white inversion of the dark theme:

| Token | Hex |
|---|---|
| `canvas` | `#FFF9EF` |
| `surface` | `#FFFFFF` |
| `surfaceRaised` | `#F2EBDD` |
| `textPrimary` | `#171717` |
| `textSecondary` | `#514B43` |
| `amber` | `#9A5F00` |
| `teal` | `#087A5A` |
| `urgent` | `#B83C36` |

All status colors require text/icon labels in both themes.

## Typography

Use **Inter** or the platform system sans as the default. The Atmos reference uses strong, clean sans typography; healthcare content benefits from familiar letterforms and predictable metrics more than decorative display fonts.

| Style | Size / line height | Weight | Usage |
|---|---:|---:|---|
| Display | `32 / 38` | 700 | One short hero statement only. |
| Screen title | `28 / 34` | 700 | Route title. |
| Section title | `20 / 26` | 700 | Card/section heading. |
| Body large | `17 / 25` | 400 | Primary instructions. |
| Body | `16 / 24` | 400 | Default copy and list items. |
| Label | `13 / 18` | 600 | Metadata and controls; never essential meaning alone. |
| Numeric reading | `48 / 52` | 700 | Glucose value with unit adjacent. |

Rules:

- Support Dynamic Type / system font scaling up to at least `200%`.
- Do not use all caps for sentences; reserve uppercase for short metadata labels.
- Keep body line length under approximately 60 characters on mobile.
- Numerals always include their unit and context: `112 mg/dL · 2 h after lunch`.

## Iconography

- Use one consistent outline icon set (Lucide or another reviewed SVG set).
- Icons are supporting cues, never the only label.
- Icon buttons require an accessible label and a visible pressed/focused state.
- Do not use emoji as medical-status icons.
- Use a phone icon for emergency call, a bell for reminder, a calendar for appointments, and a pulse/drop icon only as secondary metaphors.

## Surface and depth

### Cards

- Background: `surface` or `surfaceRaised`.
- Border: `1 px` `outline`.
- Shadow: subtle and warm, never a large black blur over the whole screen.
- Radius: `20 pt` for feature cards.
- Internal padding: `20 pt`.

### Atmos-inspired energy treatment

Use only in the Today header and onboarding hero:

```text
canvas → surface → narrow amber/ochre vertical glow → transparent
```

The glow is a decorative layer with `0.10–0.18` opacity and must never carry the only information. When reduced motion is enabled, keep it static.

## Navigation

### Primary destinations

Use four bottom tabs:

1. **Today** — next action, current state, quick glucose entry.
2. **History** — readings, medication events, incidents, reports.
3. **Care** — medications, glucose plan, appointments, contacts.
4. **Profile** — emergency card, accessibility, privacy, settings.

The persistent **Get help** action is not a tab. It is a high-visibility action in the Today header and available from the main routes.

### Bottom tab rules

- Four tabs maximum; never add a fifth tab for a low-frequency feature.
- Active tab uses amber plus a text label and icon.
- Inactive labels remain readable; do not rely on opacity alone.
- Preserve predictable back behavior and route titles.

## Screen specifications

### 1. Onboarding — “Tu control, en calma”

Atmos-inspired hero, adapted for trust:

- Dark canvas with a static amber vertical glow.
- One short headline: **“Tu control, en calma.”**
- Supporting text: “Registra, recuerda y pide ayuda cuando la necesites.”
- Primary button: **Configurar mi cuidado**.
- Secondary: **Explorar sin cuenta**.
- Three-step progress indicator with text: `1 de 3`.

Do not ask for every health field in the first screen. Ask only for language, unit, emergency number, and whether to enable reminders.

### 2. Today — primary screen

Order from urgent to routine:

1. Compact greeting + privacy-safe sync status.
2. Safety banner only when needed.
3. **Next action card**: “Glucosa pendiente · 8:00 a. m.” or “Todo al día por ahora.”
4. Large **Record glucose** button.
5. Today timeline: medications, measurements, appointments.
6. Small trend summary with text alternative.
7. Get help action.

The first card is the visual equivalent of Atmos’s phone focal point: one clear current state, not a full dashboard.

### 3. Quick glucose entry

- Full-width numeric field, `48 pt` value type.
- Unit segmented control: `mg/dL` / `mmol/L`, with current choice spoken by screen reader.
- Context chips: `Ayunas`, `Antes de comer`, `Después de comer`, `Antes de dormir`, `Otro`.
- Sticky bottom action: **Guardar lectura**.
- After save: result category, care-plan explanation, next action.
- Never place a medication dose suggestion in this flow.

### 4. History

- Filter by date and event type.
- Group by day with clear date headers.
- Reading row: value, unit, context, local time, source.
- Status uses label + icon + optional color.
- Charts have a text summary and accessible table alternative.

### 5. Medication and measurement routine

Use a vertical timeline with large completion actions:

- Medication name + prescribed text + route.
- Scheduled time and “not recorded / taken / skipped / snoozed.”
- One clear helper action: **No estoy seguro qué hacer** → care-team instruction/contact.

Never use a guilt score, streak, or red badge for a missed action.

### 6. Appointments

Use status chips with text:

`Por autorizar` → `Autorizada` → `Agendada` → `Completada`

Each card includes date, location, provider, reminder, and the next administrative action.

### 7. Emergency card

- Offline-first, high-contrast card.
- Show preferred name, diabetes type, insulin use, allergies, current medicines, trusted contact, EPS/IPS, and last updated time.
- Use a “Show to responder” action that does not require cloud access.
- Add a clear incompleteness notice: “Verifica que esta información esté actualizada.”

### 8. Get help

The highest-priority action uses a distinct urgent surface, not an ambiguous icon:

1. **Llamar a emergencias** — configured local number.
2. **Avisar a mi contacto** — consented channels only.
3. **Mostrar mi tarjeta médica**.
4. Optional symptom note after the first three actions are available.

No auto-call, no hidden countdown, and no wait for GPS or network.

## Interaction and motion

- Use `Pressable`, not opaque touch wrappers, for new controls.
- Press feedback: scale `0.98` and/or native ripple; duration `120–180 ms`.
- Bottom sheets use spring motion only for navigation clarity, not decoration.
- Standard transitions: `180–260 ms`, ease-out.
- Avoid continuous glow, parallax, and pulsing alerts.
- Respect reduced-motion settings by removing transforms and looping animation.
- Haptics reinforce save, reminder acknowledgement, and emergency confirmation; never replace visual/audio feedback.

## Accessibility contract

- Every icon button has `accessibilityLabel`, role, state, and hint where needed.
- Dynamic risk/result messages use live-region announcements without interrupting routine reading.
- Emergency state uses assertive announcement only when an actual urgent rule or user action requires it.
- Focus moves to the new screen title or result after navigation/save.
- Text remains readable at 200% scaling and does not clip inside cards.
- Contrast target: WCAG 2.2 AA minimum; verify native rendering on both platforms.
- No interaction depends on color, sound, hover, swipe, or precise timing.

## Component inventory

### Foundation

`Screen`, `SafeArea`, `AppText`, `Icon`, `Divider`, `StatusBadge`, `FocusRing`, `LoadingState`, `EmptyState`, `ErrorState`.

### Core

`TodayNextActionCard`, `GlucoseValueInput`, `ContextChip`, `ReadingRow`, `CarePlanBanner`, `MedicationTimelineItem`, `AppointmentCard`, `EmergencyCard`, `GetHelpSheet`, `DeliveryStatus`, `AccessibleChartSummary`.

### States every component must define

`default`, `pressed`, `focused`, `disabled`, `loading`, `error`, `offline`, `large-text`, `reduced-motion`.

## Responsive adaptation

### Compact phones (`≤375 pt`)

- Reduce horizontal inset to `16 pt`.
- Keep value and unit on one line only if they fit; otherwise stack them.
- Collapse secondary helper copy behind “Más información.”
- Never shrink body text below the base scale.

### Large phones/tablets (`≥600 pt`)

- Preserve mobile bottom navigation.
- Increase card width only up to a readable max; do not stretch paragraphs across the screen.
- Use a two-column layout for History/Care only after the primary mobile flow is complete.

## Content examples

Prefer:

- “Tu lectura está fuera del rango de tu plan.”
- “No se pudo confirmar el envío. Llama directamente a tu contacto.”
- “Medicamento registrado como tomado a las 8:02 a. m.”

Avoid:

- “Tu azúcar está mal.”
- “Todo está bien” when only a provider accepted a message.
- “Fallaste tu racha.”

## Implementation notes for Expo / React Native

- Use `SafeAreaView`/safe-area insets for all route roots.
- Prefer `Pressable` with `android_ripple` and an iOS pressed style.
- Centralize tokens in a typed theme module; components consume semantic names, not raw hex values.
- Use `react-native-reanimated` only for short, interruptible interactions.
- Use native system fonts first; bundle a custom font only after testing startup and dynamic type.
- Keep the Today route lightweight; lazy-load reports, charts, and document export.
- Render charts with an accessible text summary and data table fallback.

## Visual QA checklist

- [ ] Does the first viewport show one clear next action?
- [ ] Is every critical number paired with a unit and context?
- [ ] Can a user complete the flow with TalkBack/VoiceOver?
- [ ] Does 200% text fit without clipping or hidden actions?
- [ ] Does urgent state use label + icon + color, not color alone?
- [ ] Does Get help remain reachable without network or login?
- [ ] Is the amber glow decorative rather than a safety signal?
- [ ] Does reduced motion remove loops and large transforms?
- [ ] Are all touch targets at least `48 × 48 pt`?
- [ ] Does the design remain usable at `375 × 812 pt`?

## Relationship to existing product docs

- Product scope: [project.md](project.md)
- Requirements: [docs/01-product-requirements.md](docs/01-product-requirements.md)
- Clinical safety: [docs/02-clinical-safety.md](docs/02-clinical-safety.md)
- Accessibility baseline: [docs/03-ux-accessibility.md](docs/03-ux-accessibility.md)
- Architecture: [docs/04-architecture.md](docs/04-architecture.md)
