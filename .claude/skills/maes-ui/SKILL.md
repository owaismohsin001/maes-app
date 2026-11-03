---
name: maes-ui
description: MaesApp's design system for native React Native screens — brand colours, type scale, spacing, the shared components in src/ui/, scan-feedback patterns and the rules for the client's 720×1440 handheld. Use before building or restyling any native screen, component or dialog in MaesApp.
---

# MAES UI

Native screens must look like one product: calm, high-contrast, professional, quick to read at arm's length in a warehouse. Build them **only from `src/ui/`**. If a pattern is missing, add it to `src/ui/` first, then use it. Never style one screen ad hoc.

## Brand

- Native screens follow **Odoo's colours** (user's decision, 2026-10-26): Odoo 19 purple `#714B67` is the accent, so the screens feel like part of Odoo. The MAES gold stays only on the splash/logo.
- **Light theme first.** Warehouses are bright, so the light theme is the default look. Dark mode is supported through the same tokens.
- Tone: confident and quiet. No gradients, no decorative shapes, no emoji, no all-caps paragraphs.

## Tokens (`src/ui/theme.ts`)

Always use `useUi()`, which returns `{ c, s, r, type }`. Never hard-code hex values, font sizes or spacing in a screen.

| Group | Tokens |
| --- | --- |
| Colour `c` | `bg` (screen), `surface` (cards), `surfaceAlt` (pressed/zebra), `border`, `text`, `textMuted`, `textFaint`, `brand` (ink: black/white), `onBrand`, `accent`/`accentSoft` (Odoo purple), `success`/`successSoft`/`onSuccess`, `warning`/`warningSoft`, `danger`/`dangerSoft`, `info`/`infoSoft`, `overlay` |
| Spacing `s` | 4-pt scale: `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`, `xxl 32` |
| Radius `r` | `sm 8`, `md 12`, `lg 16`, `pill 999` |
| Type `type` | `display 28/34 700`, `title 20/26 700`, `heading 17/22 600`, `body 15/21 400`, `bodyStrong 15/21 600`, `label 13/18 600`, `caption 12/16 500`, `mono 15/20 600` (codes, quantities: `fontVariant: ['tabular-nums']`) |

- **Colour carries meaning.**
  - `success` = done or accepted, `warning` = attention, `danger` = blocked or failed, `info` = neutral news.
  - `accent` is for icons, brand accents and "selected / current" markers, never for status.
  - Use the soft variants as backgrounds behind status text, with the strong colour as foreground.

## Components (`src/ui/`)

| Component | Use for |
| --- | --- |
| `Screen` | Root of every screen: safe-area insets, `bg`, status bar style |
| `Header` | Title + optional subtitle, back button, up to 2 icon actions on the right. 56dp tall |
| `Icon` | Line icons (`react-native-svg`, Lucide-style 24×24 paths, 2px stroke). Add new glyphs to the map in `Icon.tsx` |
| `Button` | `variant`: `primary` (brand ink, filled), `secondary` (outlined), `ghost`, `danger`, `success` (green, filled: Validate); `size`: `lg` 56dp / `md` 48dp; `icon`, `loading`, `disabled`. Max one primary per screen |
| `Card` | Grouped content on `surface` with `border`, radius `lg`. No shadows on Android; use a hairline border |
| `ListRow` | Tappable row: leading icon/badge, title, subtitle, trailing value/chevron. ≥ 64dp |
| `Badge` | Small status pill: `tone` = success / warning / danger / info / neutral / accent |
| `StateView` | Loading (logo spinner), empty, error and offline states, with icon, title, body and action |
| `ScanProblemNotice` | Bottom notice when the scanner stopped reading: what happened + Try again (shown by `ScanLayout`) |
| `ScanWindow` | The scan engine's live picture (`full` on the Barcode home's Scanner tab): state badge, problems with Try again, "No scanner connected" on phones |
| `ScanToast` | Feedback for each scan, sliding in at the bottom of the content: tone + message, auto-hides |
| `Sheet` | Bottom sheet for confirmations and small forms (backorder, extra product, manual code, quantity). Not a `Modal` (see below) |
| `Stepper` | − qty + control, 48dp buttons, tabular number in the middle |
| `ProgressBar` | done/demand on lines and on the picking header |
| `DetailCard` / `DetailRow` | Read-only record details: titled card of icon + label + value rows (`half` for two per line, `mono` for codes/quantities) |
| `Segmented` | Two or three tabs/filters with a sliding pill; an option may carry a `count` badge (hidden when 0) |
| `Tile` / `TileGrid` | Home-screen shortcuts, two per line: big icon on `accentSoft`, small label under it, optional count in the corner |
| `CardSegment` | One card split across a FlatList's header, rows and footer (`edge` top/bottom) |
| `OverviewCard` / `SplitBar` | Head of an overview screen: label + big total, a bar of how it splits (`shares` with tones) and a legend, then a tinted status line (what needs attention, or all is well) |

## Layout rules (client handheld: 720×1440 px, density 320 → 360×720 dp)

- Design for **360dp width**. Side padding `s.lg` (16). Nothing may need horizontal scrolling.
- Tap targets ≥ 48dp (gloves, one hand). The primary action sits at the bottom, in thumb reach.
- The app is locked to portrait (2026-10-26), but the visible height still shrinks (keyboard, sheets, large font scale). Every scanning screen must scroll (`FlatList`/`ScrollView`), never fixed-height stacks that collapse.
- Long lists: `FlatList` with a stable `keyExtractor`. Avoid nested scroll views.
- Numbers that change (quantities, counts) use `type.mono` so they don't jump.
- Text truncation: product names get `numberOfLines={2}`, codes `numberOfLines={1}` with `ellipsizeMode="middle"`.

## Scanning UX

- **No bottom ScanBar** (client's wish, 2026-10-28). `ScanLayout` puts the manual-entry keyboard button in the screen's `Header` (via `HeaderLayoutActions`, so a screen has room for one action of its own) and shows `ScanProblemNotice` when the scanner stops. The Barcode home's Scanner tab shows the scanner itself (`ScanWindow full`, `showsScanner`). The scanner reads continuously; the user never taps "scan".
- **Every scan gets feedback within 150 ms.**
  - Accepted: the device beep (`scanner.feedback()`, already done by `useLiveScanning`) + `ScanToast` success + the affected row flashes `accentSoft`.
  - Rejected: `Vibration.vibrate(...)` (`ui/feedback.ts` `rejectFeedback()`) + `ScanToast` danger with a reason the user can act on ("No product with code …. Search by reference?").
- After a scan, scroll the affected line into view and highlight it.
- Never a dead end. Unknown codes offer manual search; server answers we can't render natively offer **"Open in Odoo"**.
- Manual entry is always one tap away (keyboard button in the header).

## Dialogs

- Use `Sheet` from `src/ui/`. **Never `Modal`**: a modal is a separate Android window, and the side scan button's key events would not reach `MainActivity`.
- A dialog with an irreversible action states the consequence in one sentence and has exactly two buttons: the action and "Cancel / Stay".

## Motion

- Everything comes from `src/ui/motion.tsx`; never animate ad hoc in a screen.
  - Curves: `EASE_OUT` (bezier 0.2,0,0,1) for things arriving, `EASE_IN_OUT` for things opening/closing in place.
  - Screen push/pop: `MOTION_MS` (260 ms) slide + fade with `EASE_OUT`, native driver.
  - Loading → content: pass `contentKey` to `ScanLayout`; the new content fades in (`FadeIn`).
  - Show/hide a group in place: `Collapsible` (height + fade + slide, children stay mounted so opening never renders). Don't mount rows on tap, and don't use `LayoutAnimation`: on Fabric it didn't animate list rows.
  - Tappable surfaces (`Button`, `Tile`) sink on press (`PressScale`).
  - Tabs (`Segmented`): the selected pill slides (spring). Switching tabs dims the old rows with a logo spinner on top until the new rows arrive, which then slide in from the tab's side (`FadeIn shift`). A failed load shows the error state with Retry, never an endless spinner.
- `Blink`: blinks a few times when it appears, then stays (the Scanner tab's red viewfinder, user's request 2026-10-28). Not a loop.
- Feedback flashes: 450 ms. No looping animations except loading spinners and `FlowArrows` (the From › › › › To chevrons on a transfer, user's request 2026-10-28; still with reduced motion).
- Respect the reduced-motion setting (`isReduceMotion()` in `motion.tsx`): fade only.

## Copy

- Every string goes through `t()` with English source + Dutch (`nl`) in `src/i18n/index.ts`.
- Short, active, no jargon. Use "Receipt", "Delivery", "Transfer", "Count"; never "picking" or "quant" in the UI.
- Error text says what happened and what to do: "Odoo didn't answer. Check the connection and try again."

## Accessibility

- Every icon-only button has `accessibilityLabel` (translated) and `accessibilityRole="button"`.
- Contrast ≥ 4.5:1 for text. Don't put `textFaint` on `surfaceAlt` for anything important.
- Status is never colour-only: pair it with an icon or a word.

## Checklist before calling a screen done

- [ ] Built only from `src/ui/` components and tokens
- [ ] Loading, empty, error and offline states
- [ ] Works at 360×720 portrait, also with the keyboard open (scrolls)
- [ ] Scan feedback (accept/reject) and manual entry
- [ ] All strings translated (en + nl)
- [ ] `/check` passes
