# UX and accessibility specification

## Design goal

A person with low vision, tremor, reduced hearing, screen-reader use, fatigue, or temporary confusion must still understand the next safe action.

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG/) plus native Android/iOS accessibility behavior. WCAG is a baseline, not proof that a medical workflow is usable.

## Information architecture

Use four primary destinations:

1. **Today:** next measurement, next medication, appointment, and quick glucose entry.
2. **History:** readings, medication events, incidents, and reports.
3. **Care:** medications, measurement plan, appointments, care team, and trusted contacts.
4. **Profile:** emergency card, accessibility, privacy, export, and account.

The **Get help** action remains visually and semantically prominent on every main screen, without causing accidental activation.

## Home-screen hierarchy

1. Current safety message, if any.
2. One primary next action.
3. “Record glucose” large button.
4. Today’s remaining items.
5. Secondary summary.

Do not show dense dashboards, tiny charts, gamified streaks, or multiple competing calls to action.

## Accessibility requirements

### Vision

- Support system font scaling to at least 200% without clipping or hiding actions.
- Default body text target: 18sp; never below platform-readable minimums.
- Text contrast at least 4.5:1; large text and essential UI graphics at least 3:1.
- Offer high-contrast light and dark themes.
- Never use color alone: pair status with icon, label, and accessible announcement.
- Charts include a text summary and table alternative.

### Motor and dexterity

- Interactive target goal: at least 48×48 dp, with adequate spacing.
- No gesture-only action; provide visible controls for swipe or drag alternatives.
- Destructive or emergency actions use a large confirmation sheet, not a tiny dialog.
- Avoid time-limited input. Snooze and repeat instructions remain available.

### Hearing

- Every sound has visible and haptic equivalents.
- Captions/transcripts are required for any educational media.
- Notification sound and vibration are user-configurable and testable.

### Cognitive orientation

- Use short sentences, literal labels, stable navigation, and one decision per screen.
- Show date, time, and “what happens next” explicitly.
- Confirm completed actions with the item and timestamp: “Metformin recorded as taken at 8:02 a.m.”
- Provide simplified mode with fewer secondary controls.
- Avoid shame, blame, celebration confetti, or ambiguous urgency.
- Keep emergency steps numbered and available offline.

### Screen readers and switch access

React Native exposes native accessibility APIs for VoiceOver and TalkBack; interactive controls require roles, labels, states, values, and hints where needed. See the [React Native accessibility reference](https://reactnative.dev/docs/accessibility).

- Logical focus order follows visual order.
- Screen title receives focus after navigation when appropriate.
- Dynamic risk results use polite announcements; emergency results use assertive alerts sparingly.
- Values are spoken with unit and context, not as unlabeled numbers.
- Group related text without hiding nested controls.
- Modal focus is trapped and restored correctly.

## Key screen specifications

### Quick glucose entry

- Numeric keypad with unit always visible.
- Large value field and a “Use another unit” action separated from save.
- Context chips with text, not icons alone.
- Save button disabled only with a clear reason.
- Implausible value confirmation repeats value and unit.
- Result screen begins with action, then explanation.

### Medication reminder

- Medication name, prescribed dose text, route, and scheduled time.
- Primary actions: **Taken**, **Snooze**, **Skip**.
- “Not sure what to do” opens clinician instructions/contact; it does not guess.
- Lock-screen content is privacy-preserving by default.

### Get help

- Header: “Do you need urgent help?”
- Primary: **Call [configured service]**.
- Secondary: **Alert my trusted contacts**.
- Tertiary: **Show my emergency card**.
- Show network/contact-delivery limitations in plain language without delaying the call.

## Content style

Use calm, direct language:

- Prefer: “Your reading is below the range in your care plan.”
- Avoid: “Danger! Your glucose is bad.”
- Prefer: “The alert could not be sent. Call your contact directly.”
- Avoid: “Everything is okay” when only a send request succeeded.

All UI copy remains in neutral, professional language. Medical words include an optional plain-language explanation.

## Accessibility test matrix

| Scenario | Android | iOS | Web |
|---|---:|---:|---:|
| Screen reader | TalkBack | VoiceOver | NVDA/VoiceOver |
| Large text/reflow | 200%+ | Largest accessibility sizes | 200% zoom |
| High contrast/dark mode | Required | Required | Required |
| Switch/keyboard navigation | Switch Access | Switch Control | Keyboard-only |
| Reduced motion | Required | Required | Required |
| Color blindness | Simulator + human review | Simulator + human review | Automated + human |

## Usability acceptance

- Record glucose from launch in no more than three purposeful actions after authentication state is resolved.
- Start an emergency call in no more than two actions from a primary screen.
- A first-time user can distinguish “reminder fired,” “medication taken,” and “contact acknowledged.”
- Critical tasks succeed with screen reader and largest supported text without hidden controls.
- No clinical category is communicated by color alone.
