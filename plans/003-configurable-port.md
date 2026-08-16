# Plan 003: Read the HTTP port from the PORT environment variable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 482d6e1..HEAD -- server.ts .env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `482d6e1`, 2026-08-16

## Why this matters

`server.ts:10` hardcodes `const PORT = 3000;`. Every major container
platform — Cloud Run (which this repo's `metadata.json` and README lineage
target), Docker, Heroku-style PaaS — injects the expected listen port via
the `PORT` environment variable. A hardcoded port means the container
either fails its health check or needs a platform-specific override on every
deploy. Reading `PORT` with a 3000 fallback is a one-line fix that keeps
local dev unchanged and unblocks standard deployments.

## Current state

- `server.ts` — Express server entry. Relevant excerpt, `server.ts:8-10`:
```ts
async function startServer() {
  const app = express();
  const PORT = 3000;
```
  and the listener at `server.ts:255-257`:
```ts
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
```

- `.env.example` documents `GEMINI_API_KEY`, `APP_URL`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` — no `PORT` entry yet.
- Repo conventions: `dotenv.config()` is already called at `server.ts:6`,
  so `process.env.PORT` works both from the platform and from a local
  `.env`. No new dependencies.

## Commands you will need

| Purpose   | Command          | Expected on success   |
|-----------|------------------|-----------------------|
| Typecheck | `npm run lint`   | exit 0, no errors     |
| Tests     | `npm test`       | 18 tests pass         |
| Build     | `npm run build`  | exit 0                |

## Scope

**In scope** (the only files you should modify):
- `server.ts`
- `.env.example`

**Out of scope** (do NOT touch, even though they look related):
- `package.json` scripts — `npm run dev` / `npm start` need no change; the
  default stays 3000.
- `vite.config.ts` — the Vite dev middleware shares the Express server, no
  port config of its own here.
- Do not add HOST/BIND configuration — `0.0.0.0` is already correct for
  containers.

## Git workflow

- Do NOT commit, push, or open a PR — the orchestrator reviews the working
  tree. (If your operator explicitly instructs commits: `fix(server): honor PORT env var for container deployments`.)

## Steps

### Step 1: Read PORT from the environment with a 3000 fallback

Replace `server.ts:10` with:

```ts
  const PORT = Number(process.env.PORT) || 3000;
```

(`Number('')` is 0 → falsy → falls back to 3000; a garbage non-numeric
value yields NaN → also falls back. Both behaviors are desired.)

**Verify**: `npm run lint` → exit 0.

### Step 2: Document PORT in .env.example

Append to `.env.example`:

```
# PORT: HTTP port the server listens on. Container platforms (e.g. Cloud Run)
# inject this automatically; defaults to 3000 for local development.
# PORT="3000"
```

**Verify**: `cat .env.example | grep PORT` shows the new block.

### Step 3: Smoke-test both modes

- Default: `npx tsx server.ts` (no PORT set) → stdout shows
  `Server running on http://localhost:3000`; `curl -s http://localhost:3000/api/health`
  returns `{"status":"ok"}`. Kill the server.
- Override: `PORT=4321 npx tsx server.ts` → stdout shows port 4321;
  `curl -s http://localhost:4321/api/health` returns `{"status":"ok"}`.
  Kill the server.

**Verify**: both curls return the health JSON on the expected port.

## Test plan

- No new automated tests (server has no test harness today — that is
  plan 004). The manual smoke test in Step 3 is the verification of record.
- Existing suite must stay green: `npm test` → 18 tests pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 (18 tests)
- [ ] `npm run build` exits 0
- [ ] `grep -n "process.env.PORT" server.ts` shows the new line
- [ ] Both smoke tests in Step 3 pass
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `server.ts:10` no longer matches the excerpt (drift since `482d6e1`).
- Some other code depends on the literal value 3000 (search
  `grep -rn "3000" src/ server.ts package.json vite.config.ts` — if a
  client-side fetch hardcodes `:3000`, report it; do not rewrite client
  URLs in this plan).

## Maintenance notes

- Reviewers should confirm the production start path (`npm start` →
  `node dist/server.cjs`) picks up `PORT` the same way — esbuild bundles
  `process.env.PORT` as a runtime lookup, so it does.
- If the deployment platform also requires a `/api/health`-style probe on a
  specific path, that route already exists (`server.ts:26`) and needs no
  change.
