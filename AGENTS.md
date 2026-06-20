# theconvertor

Angular 21.2 standalone SPA — browser-based PDF editor (merge, split, annotate, convert, OCR, encrypt).

## Quick start

```bash
npm install    # uses npm@11.11.0 (enforced via packageManager)
ng serve       # dev server at http://localhost:4200
ng build       # prod build → dist/ (defaultConfiguration: production)
ng test        # Vitest (not Karma) — single run
```

## Dev server — required headers

`angular.json` adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for SharedArrayBuffer / WASM (`qpdf-wasm`, `pdfjs-dist`). Must use `ng serve` (or configure your own server with those headers).

## Code conventions

| Aspect | Convention |
|--------|-----------|
| Component files | `feature.ts` (NOT `feature.component.ts`) |
| Templates | `.html`, stylesheets are plain `.css` (no SCSS) |
| Test files | `feature.spec.ts` adjacent to component |
| Imports | Standalone components with explicit `imports` arrays |
| TypeScript | `strict: true`, `noImplicitOverride`, `strictTemplates` |
| Formatting | Prettier, `singleQuote: true`, `printWidth: 100`, Angular HTML parser |
| Styling | Tailwind CSS v4 via PostCSS (`@tailwindcss/postcss` plugin) |

## Key dependencies

- **pdfjs-dist** v6 — worker loaded at runtime: `pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'`
- **pdf-lib** — PDF create/modify
- **fabric** v7 — canvas manipulation
- **tesseract.js** — OCR
- **qpdf-wasm** — WASM-based QPDF for encryption/decryption (assets copied from `node_modules/qpdf-wasm` to `/assets/` in build)
- **@fortawesome/fontawesome-free** v7 — icons (imported in `styles.css`)

## Architecture

```
src/main.ts                        ← bootstrap (bootstrapApplication)
  └─ app/app.ts (App)              ← root standalone component
      └─ layout/mainscreen/        ← main PDF editor (~4000+ lines, single component)
          ├─ mainscreen.ts         ← all PDF editing logic (mounted at <app-pdf-editor>)
          ├─ mainscreen.html
          ├─ mainscreen.css
          └─ fonts/font-catalog.ts ← font picker data
      ├─ layout/header/, footer/, tools/, guides/  ← shell components (mostly presentational)
      └─ layout/services/pdfconvert.ts             ← currently empty
```

**No routing** (routes array is empty). **Single view** — the `Mainscreen` component is the entire app.

## Test quirks

- `app.spec.ts` expects `<h1>Hello, theconvertor</h1>` but the real template has `<h1>PDF Operations Studio</h1>` — that test will fail (legacy stub).
- Use `ng test` (Vitest, not Karma). Test config via `@angular/build:unit-test` builder. Types include `vitest/globals`.
