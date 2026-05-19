# Watch Collection

A personal watch collection manager that runs as a static site on GitHub Pages and stores its data in a separate **private** repo via the GitHub REST API. No backend, no extra services, no subscriptions.

## How it works

- **This repo** (`watch-collection`) — public, holds the React + TypeScript app. Deployed to GitHub Pages.
- **Data repo** (`watch-collection-data`) — private, holds `data.json` and uploaded photos. The app reads and writes it at runtime using a fine-grained personal access token stored only in your browser.

The token never leaves your device; the public site bundle ships zero collection data.

## Features

- Track watches with status `owned` / `sold` / `gifted` (sold/gifted preserved with full history)
- Daily wear log with auto-geolocation (or manual fallback)
- Bulk backfill grid for catching up after a gap
- CSV import for migrating from a spreadsheet wear log
- Per-watch native currency with historical FX → GBP via [frankfurter.app](https://www.frankfurter.app/)
- Analytics: cumulative spend, wear distribution, brand mix, movement mix, spend per year, wears per month, travel map
- Wishlist with priority + gap-driven suggestions
- PWA — installable on phone, caches map tiles and FX rates offline

## Setup

### 1. Create the private data repo

```bash
gh repo create watch-collection-data --private --add-readme
```

### 2. Create a fine-grained PAT

At [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens):

- Resource owner: yourself
- Repository access: only `watch-collection-data`
- Permissions: **Contents: Read and write**
- Expiration: as long as you're comfortable with

Copy the token.

### 3. Run locally

```bash
npm install
npm run dev
```

Open the app, go to Settings, paste the token + username + data repo name, then import your CSV.

### 4. Deploy

```bash
gh repo create watch-collection --public --source=. --remote=origin --push
```

The included GitHub Action will build and deploy on every push to `main`. After the first deploy, enable Pages in repo settings (Source: GitHub Actions). Site will be live at `https://<username>.github.io/watch-collection/`.

## CSV import format

Tab- or comma-separated columns:

```
Date  Weekday  Month  Brand  Model  City  Region  Country
```

Dates as DD/MM/YYYY. The importer infers your collection from distinct Brand+Model pairs.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- React Router (HashRouter for Pages compatibility)
- Recharts (charts) + Leaflet (map)
- date-fns, papaparse, nanoid, lucide-react
- vite-plugin-pwa
