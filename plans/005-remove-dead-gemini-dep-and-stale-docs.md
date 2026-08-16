# Plan 005: Remove the dead @google/genai dependency and rewrite the stale README

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 482d6e1..HEAD -- package.json package-lock.json README.md .env.example metadata.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `482d6e1`, 2026-08-16

## Why this matters

`package.json` declares `@google/genai` and `.env.example` leads with
`GEMINI_API_KEY`, but no source file imports or references either
(`grep -rn "GEMINI\|genai\|@google/genai" src/ server.ts index.html` returns
nothing). The README is the original AI Studio scaffold boilerplate — it
tells a new developer to "Set the `GEMINI_API_KEY` in .env.local" and links
to an AI Studio app page, none of which applies to this Google Calendar SRS
app. Dead dependencies inflate install time and audit surface; actively
wrong setup docs cost every new contributor (human or agent) real time.

## Current state

- `package.json:16` — `"@google/genai": "^2.4.0",` in `dependencies`.
- `.env.example:1-4` — leads with `GEMINI_API_KEY` boilerplate:
```
# GEMINI_API_KEY: Required for Gemini AI API calls.
# AI Studio automatically injects this at runtime from user secrets.
# Users configure this via the Secrets panel in the AI Studio UI.
GEMINI_API_KEY="MY_GEMINI_API_KEY"
```
- `metadata.json` — contains `"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]`
  (an AI Studio manifest field; harmless but stale).
- `README.md` — full current content is 20 lines of AI Studio boilerplate
  ("Run and deploy your AI Studio app", GEMINI_API_KEY setup, link to
  ai.studio). None of it describes Tong Matra.
- Actual app (for the new README): React 19 + Vite SPA, Express `server.ts`
  handles Google OAuth (`/api/auth/url`, `/auth/callback`) and serves
  `dist/` in production. Env vars actually used: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `APP_URL` (server); `VITE_GOOGLE_CLIENT_ID`
  (build-time client). Commands: `npm install`, `npm run dev`,
  `npm run build`, `npm start`, `npm test`, `npm run lint`.

## Commands you will need

| Purpose   | Command                          | Expected on success   |
|-----------|----------------------------------|-----------------------|
| Remove dep| `npm uninstall @google/genai`    | exit 0                |
| Typecheck | `npm run lint`                   | exit 0, no errors     |
| Tests     | `npm test`                       | 18 tests pass         |
| Build     | `npm run build`                  | exit 0                |

## Scope

**In scope** (the only files you should modify):
- `package.json` / `package-lock.json` (via `npm uninstall`)
- `README.md` (rewrite)
- `.env.example` (remove the GEMINI block)
- `metadata.json` (remove the stale capability, only if it is clearly an
  AI Studio manifest field — see STOP conditions)

**Out of scope** (do NOT touch, even though they look related):
- `src/`, `server.ts` — no code changes.
- Do not remove any other dependency, even if it looks unused — scope is
  `@google/genai` only. (If you suspect others, note them in your completion
  summary for a future audit.)

## Git workflow

- Do NOT commit, push, or open a PR — the orchestrator reviews the working
  tree. (If your operator explicitly instructs commits: `chore: drop unused @google/genai dependency and rewrite README`.)

## Steps

### Step 1: Confirm the dependency is truly unreferenced

Run:
```
grep -rn "@google/genai\|GoogleGenAI\|GoogleGenerativeAI" src/ server.ts index.html vite.config.ts
```
Expected: no matches. If there IS a match, STOP (see STOP conditions).

**Verify**: grep returns nothing.

### Step 2: Uninstall the dependency

`npm uninstall @google/genai`

**Verify**: `npm ls @google/genai` reports "(empty)"; `npm run build` and
`npm test` both exit 0.

### Step 3: Clean .env.example

Remove the `GEMINI_API_KEY` block (lines 1-4) from `.env.example`. Keep the
`APP_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` blocks. Add a
`VITE_GOOGLE_CLIENT_ID` entry, since the client build reads it
(`src/lib/auth.ts:43` reads `import.meta.env.VITE_GOOGLE_CLIENT_ID`):

```
# VITE_GOOGLE_CLIENT_ID: Google OAuth Client ID baked into the client bundle
# at build time (read via import.meta.env in src/lib/auth.ts).
VITE_GOOGLE_CLIENT_ID=""
```

**Verify**: `grep -c GEMINI .env.example` → 0; `grep -c VITE_GOOGLE_CLIENT_ID .env.example` → 1.

### Step 4: Rewrite README.md

Replace the entire README with a concise project README. Required sections:
project name + one-line description (Thai law-study SRS planner syncing to
Google Calendar), prerequisites (Node.js), setup (`npm install`, env vars
from `.env.example` — name each variable and where it is used), dev
(`npm run dev`), production (`npm run build && npm start`), tests
(`npm test`), lint (`npm run lint`). Match the factual tone of the repo;
do not add badges, screenshots, or marketing copy. Remove the AI Studio
banner image and ai.studio link.

**Verify**: `grep -ci "ai studio\|GEMINI" README.md` → 0.

### Step 5: metadata.json capability field

Read `metadata.json`. If it contains
`"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]` and no
other content depends on it, remove that field (keep `name` and
`description`). If the file's consumer is unclear (it may be read by the
AI Studio hosting panel), leave it and note the decision in your completion
summary instead.

**Verify**: `cat metadata.json` shows the intended final state.

## Test plan

- No new tests — nothing behavioral changes.
- Existing suite must stay green: `npm test` → 18 tests pass.
- Full verification: `npm run lint && npm run build && npm test` all exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm ls @google/genai` reports empty
- [ ] `grep -rn "@google/genai" src/ server.ts package.json` returns no matches
- [ ] `grep -ci "GEMINI" README.md .env.example` → 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 (18 tests)
- [ ] `npm run build` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep finds a real usage of `@google/genai` (the dependency is
  not dead — the finding is wrong).
- `npm uninstall` breaks the build or tests for a non-obvious reason.
- `metadata.json` turns out to be consumed by the deployment platform in a
  way that requires the capability field (check for deploy scripts/docs).

## Maintenance notes

- `npm audit` at audit time reported fixable advisories in transitive deps
  (`body-parser`, `postcss`, `nanoid`, `@babel/core`, `esbuild`). Removing
  `@google/genai` may clear some; a dedicated `npm audit fix` pass is a
  separate, deliberately-deferred task (it touches the whole lockfile and
  deserves its own verification run).
- Reviewers should double-check no deployment doc outside the repo
  references the GEMINI_API_KEY setup.
