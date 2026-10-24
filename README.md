# Expense Tracker

Phone-first PWA that uses your own Google Sheet as the database. No AI, no third-party analytics. Built from `Expense Tracker Plan.md`. Inspired by **Ankur Warikoo** [video](https://youtu.be/zHTjc-lszXI?si=NbK_mEvjBDBX28Vj).

The app runs in **demo mode** (generated sample data, in memory) until a script URL and token are saved in Settings.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # type-check + production build + service worker
npm run preview
```

UI: React + Tailwind v4 + shadcn/ui (Base UI) + Recharts. Design tokens live in `src/index.css` (light and dark).

## Connect your sheet

Step-by-step guide: [`apps-script/README.md`](apps-script/README.md). Then check it with `node scripts/smoke-sheet.mjs "<web-app URL>" "<token>"`.

The token is stored in `localStorage` only. It is not in the repo or the bundle.

## Settings worth knowing

- **Monthly budget:** a salary here overrides the Setup tab's yearly table. Split is 50:30:20 or custom (must add to 100%).
- **Recurring saving:** adds a Saving entry on a chosen day each month (id `recurring-saving-YYYY-MM`, so two phones don't double it). Delete it in History if you skipped that month; it is not re-created.
- **Bills:** monthly payments from the sheet's Recurring Payments tab. Tick them as you pay (adjust the amount if it varies), then **Log N payments** adds them all to Daily Expense Tracker. Each gets the id `bill-<id>-<YYYY-MM>`, so it can't be logged twice and **Undo** removes it. Ticks stay on the device until logged; editing the bill list needs a connection.
- **Category guessing:** `src/lib/seedKeywords.json` holds cold-start hints; your history takes over as soon as it has examples.

## Deploy

Cloudflare Pages: build command `npm run build`, output `dist`. `public/_redirects` gives SPA routing. Vercel: `vercel.json` sets the build, SPA rewrite and cache headers (`sw.js`/`index.html` never cached, so phones pick up new versions). Deploy with `npx vercel --prod`.

## Where things live

- `src/data/api.ts` Apps Script client (`text/plain` POSTs, no preflight), `mockApi.ts` demo/test double
- `src/data/db.ts`, `sync.ts` IndexedDB cache (13 months) and idempotent outbox
- `src/data/store.tsx` app state; `settings.tsx` preferences
- `src/lib/aggregate.ts` weekly, monthly and heatmap maths (all computed from raw rows)
- `src/lib/parser.ts` quick entry, `predictor.ts` category guesses, `budget.ts`, `recurring.ts`
- `apps-script/ExpenseApi.gs` the backend (added next to your own `Code.gs`); `ExpenseApi.test.ts` runs it against a fake spreadsheet
