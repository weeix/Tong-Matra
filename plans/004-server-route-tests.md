# Plan 004: Add vitest coverage for the Express server routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 482d6e1..HEAD -- server.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (but lands best after plans 001–003 so tests assert the hardened behavior)
- **Category**: tests
- **Planned at**: commit `482d6e1`, 2026-08-16

## Why this matters

The repo has exactly one test file (`src/lib/calendar.test.ts`, 18 tests)
covering the calendar sync logic. The Express server in `server.ts` — which
handles the OAuth callback, token exchange, client error reporting, and
production static serving — has **zero** automated coverage. The OAuth
callback is the highest-risk code path in the repo (it touches live Google
credentials and user tokens), and the error-log sanitizer has explicit
size-limit logic (`MAX_FIELD_BYTES`, `MAX_TOTAL_BYTES`) that is easy to
break silently. A regression here ships without any signal.

This plan adds a lightweight supertest-based suite that exercises the
server routes in-process, without mocking Google — the external calls are
stubbed at the `fetch` boundary, matching how `calendar.test.ts` already
stubs `fetchFn` for the calendar service.

## Current state

- `server.ts` — Express app, not exported; `startServer()` is called at
  module scope (`server.ts:260`). To test it, the app must be importable
  without listening. Relevant excerpt of the current shape:
```ts
async function startServer() {
  const app = express();
  const PORT = 3000;
  // ... routes ...
  app.listen(PORT, '0.0.0.0', () => { ... });
}
startServer();
```
- `src/lib/calendar.test.ts` — existing test pattern to follow: vitest,
  `describe`/`it`/`expect`, async tests, stubbed fetch functions injected
  via constructor. Model the new server tests after this file's structure.
- `package.json` — `npm test` runs `vitest run`. No test script changes
  needed; vitest picks up `*.test.ts` anywhere.
- Dev dependencies already include `vitest@^4.1.7` and `tsx`. You will need
  to add `supertest` and `@types/supertest` as devDependencies.

## Commands you will need

| Purpose   | Command                          | Expected on success   |
|-----------|----------------------------------|-----------------------|
| Install   | `npm install -D supertest @types/supertest` | exit 0 |
| Typecheck | `npm run lint`                   | exit 0, no errors     |
| Tests     | `npm test`                       | all pass, incl. new   |
| Build     | `npm run build`                  | exit 0                |

## Scope

**In scope** (the only files you should modify):
- `server.ts` (export the app factory; keep the listen side-effect behind
  an import-time guard)
- `server.test.ts` (create)
- `package.json` / `package-lock.json` (add supertest devDependencies only)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/calendar.ts`, `src/lib/calendar.test.ts` — already covered.
- `src/lib/auth.ts` — client-side; plan 002's scope.
- Do not add a coverage tool, CI workflow, or test script changes beyond
  the new file.

## Git workflow

- Do NOT commit, push, or open a PR — the orchestrator reviews the working
  tree. (If your operator explicitly instructs commits: `test(server): add supertest coverage for oauth and error-log routes`.)

## Steps

### Step 1: Make the Express app importable without listening

Refactor `server.ts` so the app is built by an exported factory and the
listener only starts when the file is executed directly (not when imported
by tests). Keep all existing route logic identical.

Target shape:

```ts
export async function createApp() {
  const app = express();
  // ... all existing middleware and routes, unchanged ...
  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the listener when this file is the entry point, not when
// imported by tests.
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  startServer();
}
```

Note: `server.ts` is bundled to CJS by esbuild (`npm run build`), so
`require.main === module` is safe there. For the dev path (`tsx server.ts`),
`tsx` sets `require.main === module` correctly for the entry file. If you
find `require` unavailable under the ESM build, use the equivalent
`import.meta.url` check — but verify the CJS bundle still works with
`node dist/server.cjs` before finishing.

**Verify**: `npm run lint` → exit 0; `npm run build` → exit 0;
`node dist/server.cjs &` then `curl -s http://localhost:3000/api/health`
returns `{"status":"ok"}`; kill the process.

### Step 2: Install supertest

`npm install -D supertest @types/supertest`

**Verify**: `npm ls supertest` shows the installed version.

### Step 3: Write `server.test.ts`

Create `server.test.ts` at the repo root (vitest picks it up). Follow the
import/describe/it style of `src/lib/calendar.test.ts`. Cover these cases:

1. `GET /api/health` → 200, `{ status: 'ok' }`.
2. `POST /api/error-log` with a normal JSON body → 204; `console.error`
   called with `[client-error]` (spy on `console.error`).
3. `POST /api/error-log` with oversized fields → 204 and the logged
   `message` field is truncated to 4096 bytes (the `MAX_FIELD_BYTES` value
   in `server.ts:32`).
4. `POST /api/error-log` with a non-object body (e.g. send a raw string with
   `Content-Type: application/json`) → still 204 (the route must never
   crash).
5. `GET /api/auth/url` without `redirect_uri` → 400.
6. `GET /api/auth/url` with `redirect_uri` → 200 and the returned URL
   contains the supplied redirect_uri (or, if plan 001 has landed, assert
   the allow-list behavior: allowed URI → 200, disallowed → 400).
7. `GET /auth/callback` without `code` → 400.

For tests that need environment variables (`GOOGLE_CLIENT_ID`), set them in
the test with `process.env.GOOGLE_CLIENT_ID = 'test-id'` before importing
the app, and use `vi.restoreAllMocks()` / `vi.unstubAllEnvs()` in
`afterEach` as appropriate. Do NOT make real network calls — the OAuth
token-exchange test is out of scope for this plan (it requires stubbing
global fetch; note it as a follow-up in Maintenance notes).

**Verify**: `npm test` → all tests pass, including the 7 new ones plus the
existing 18 (25 total).

### Step 4: Confirm the production bundle still works

`npm run build` → exit 0. Then `node dist/server.cjs &` and
`curl -s http://localhost:3000/api/health` → `{"status":"ok"}`.
Kill the process.

**Verify**: health check passes against the bundled server.

## Test plan

The new tests ARE the test plan; they live in `server.test.ts` and follow
the structural pattern of `src/lib/calendar.test.ts` (vitest, async its,
stubbed externals). The 7 cases are listed in Step 3.

Verification: `npm test` → 25 tests pass (18 existing + 7 new).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 with 25 passing tests (18 existing + 7 new)
- [ ] `npm run build` exits 0
- [ ] `node dist/server.cjs` starts and serves `/api/health` (Step 4)
- [ ] `server.ts` exports `createApp` and no longer calls `startServer()`
  unconditionally at module scope
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `createApp` refactor cannot be done without changing route behavior
  (e.g. a route captures state that only exists at listen time).
- `require.main === module` does not work in the bundled CJS output AND
  the `import.meta.url` alternative also fails — report the bundler
  constraint instead of hacking around it.
- Adding supertest pulls in a dependency tree that breaks
  `npm run lint` or `npm test` for environmental reasons (e.g. Node
  version incompatibility).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- When plan 001 (OAuth hardening) lands first, update test case 6 to assert
  the allow-list behavior instead of the current pass-through.
- A natural follow-up (not in this plan): stub `global.fetch` to test the
  `/auth/callback` token-exchange success and failure paths, including the
  postMessage origin once plan 001 pins it.
- If the server later gains rate-limiting or auth middleware, these tests
  will need the corresponding headers/tokens — keep the `createApp` factory
  the single place where test wiring lives.
