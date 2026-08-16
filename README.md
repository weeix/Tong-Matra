# Tong Matra (ท่องมาตรา)

A Thai law-study spaced-repetition planner that syncs memorization schedules to
Google Calendar. Built for Thai law students and legal professionals.

## Prerequisites

- Node.js (20+)

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Configure environment variables. Copy `.env.example` to `.env` (and/or
   `.env.local` for Vite) and fill in the values:

   | Variable                | Used by     | Purpose                                                            |
   |-------------------------|-------------|--------------------------------------------------------------------|
   | `GOOGLE_CLIENT_ID`      | server      | Google Cloud Console OAuth Client ID (`server.ts`)                 |
   | `GOOGLE_CLIENT_SECRET`  | server      | Google Cloud Console OAuth Client Secret (`server.ts`)             |
   | `APP_URL`               | server      | Public origin of the app; pins the OAuth redirect target           |
   | `VITE_GOOGLE_CLIENT_ID` | client build| OAuth Client ID baked into the bundle (`src/lib/auth.ts`)          |

   The server also honors `PORT` (defaults to `3000`).

## Development

```sh
npm run dev
```

Runs the Express server with Vite in middleware mode.

## Production

```sh
npm run build
npm start
```

`npm run build` produces the client bundle and bundles `server.ts` to
`dist/server.cjs`; `npm start` serves the built app.

## Tests

```sh
npm test
```

## Lint / typecheck

```sh
npm run lint
```
