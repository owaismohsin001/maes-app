---
paths:
  - "App.tsx"
  - "index.js"
  - "src/**/*.{ts,tsx}"
---

# React Native app code

- App code lives under `src/` (create it with the first feature): `src/screens/`, `src/components/`, `src/api/` (the only place that talks to Odoo), `src/hooks/`, `src/i18n/`, `src/navigation/`. `App.tsx` stays a thin root that wires providers.
- Function components + hooks only. Type props and API responses explicitly — no `any` for data coming from Odoo.
- Safe area: use `useSafeAreaInsets()` / `SafeAreaView` from `react-native-safe-area-context`. React Native's own `SafeAreaView` is deprecated and wrong with edge-to-edge on Android.
- Styles: `StyleSheet.create`, support light and dark (`useColorScheme`) like the template does. Tap targets ≥ 48dp — installers use the app on site, often one-handed or with gloves.
- Every user-visible string goes through i18n with an English source and a Dutch (`nl`) translation. No hard-coded UI text in components.
- Components never call `fetch` or Odoo directly; they go through `src/api/` (see `.claude/rules/odoo-api.md`). Every screen that loads data has loading, error, empty and offline states.
- Long lists: `FlatList` (or FlashList if adopted) with a stable `keyExtractor`; never `.map()` hundreds of rows inside a `ScrollView`.
- No `console.log` of tokens, API responses with customer data, or scan payloads in committed code.
- Need a library with native code? Use `/add-native-lib` — it must support the New Architecture.
