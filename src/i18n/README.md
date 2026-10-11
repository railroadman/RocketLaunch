# Translations

Interface texts live in `locales/<code>.json`: one flat object, dotted keys, values are strings.

- Edit a value to change a translation. Keep `{placeholders}` (for example `{n}`, `{label}`) unchanged.
- HTML inside a value is allowed for keys used with `data-i18n-html` (for example `hero.subtitle`, `model.*`). Keep tags balanced.
- `ru.json` is the source: missing keys in other languages fall back to Russian.
- `npm test` checks that every locale has the same keys and placeholders as `ru.json`.

## Adding a language

1. Copy `locales/en.json` to `locales/<code>.json` and translate the values.
2. Import it in `index.ts`, add it to `dictionaries` and to `LANGS` (code, native name, number locale, speech locale).
3. Add an inline SVG flag for it in `picker.ts`.

The language is stored in `localStorage` under `flight.lang`. Without a saved choice the first supported language in the browser's preference list is used, otherwise Russian. Regional variants map to the base language. Blocked storage does not prevent switching.

The picker is mounted in the top menu and analysis dialog. `translateDOM()` updates marked text, HTML and accessibility attributes without replacing controls or canvases. `MissionUI` refreshes dynamic labels, the accumulated event log, tables and chart numbers on language changes. Events use their IDs, phases their phase codes, and camera shots use `shotLabelKey`.

Mission countdown speech intentionally stays Russian regardless of the interface language. CSV headers, phase identifiers and decimal formatting remain stable for data consumers.

`npm run test:e2e` includes six-language checks for active and paused playback, completion, analysis, keyboard navigation, narrow screens, persistence and preservation of mission/camera state.
