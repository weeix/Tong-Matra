# Plan 001: Harden the Google OAuth callback against token exfiltration

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 482d6e1..HEAD -- server.ts src/lib/auth.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `482d6e1`, 2026-08-16

## Why this matters

The OAuth callback in `server.ts` completes the authorization-code exchange
and then delivers the resulting **Google access token** to the browser in two
unsafe ways:

1. `window.opener.postMessage(..., '*')` — the wildcard target origin means
   whatever window opened the popup receives the token, not just our own
   origin. If a user is ever tricked into opening the auth flow from a
   hostile page, that page receives a live Google Calendar access token.
2. The `redirect_uri` used in the token exchange is taken verbatim from the
   `state` query parameter (`server.ts:118`), and `state` is set to whatever
   `redirect_uri` the caller of `/api/auth/url` supplied (`server.ts:104`)
   with no allow-list. An attacker who can get a victim to start the flow
   with an attacker-controlled `redirect_uri` causes the authorization code
   to be exchanged against the attacker's endpoint.

Both are standard OAuth-hardening fixes: pin the postMessage target to the
app's own origin, and validate `redirect_uri`/`state` against an allow-list
derived from server configuration.

## Current state

- `server.ts` — Express server; contains the OAuth routes. Relevant excerpts:

`server.ts:85-108` — `/api/auth/url` accepts any `redirect_uri` and echoes it
into `state`:
```ts
app.get('/api/auth/url', (req, res) => {
  const { redirect_uri } = req.query;
  if (!redirect_uri) {
    return res.status(400).json({ error: 'Missing redirect_uri query parameter' });
  }
  const client_id = process.env.GOOGLE_CLIENT_ID;
  ...
  const params = new URLSearchParams({
    client_id,
    redirect_uri: redirect_uri as string,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: redirect_uri as string, // echo redirect_uri back to callback handler
  });
  res.json({ url: `${oauth2Url}?${params.toString()}` });
});
```

`server.ts:111-118` — callback trusts `state` as the redirect URI:
```ts
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  const redirectUri = (state as string) || `${req.protocol}://${req.get('host')}/auth/callback`;
```

`server.ts:189-202` — token delivered via wildcard postMessage:
```ts
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_AUTH_SUCCESS',
          token: ${JSON.stringify(accessToken)},
          user: ${JSON.stringify(userProfile)}
        }, '*');
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        window.location.href = '/';
      }
    </script>
```

- `.env.example` already documents an `APP_URL` variable ("Used for
  self-referential links, OAuth callbacks, and API endpoints") — use it as
  the canonical origin for both fixes.
- Repo conventions: server code is plain Express with `async` handlers and
  `console.error` logging; errors return `res.status(4xx/5xx).json({error})`
  or a small HTML page for the OAuth flow. Match that style — no new
  dependencies, no new middleware packages.

## Commands you will need

| Purpose   | Command          | Expected on success        |
|-----------|------------------|----------------------------|
| Typecheck | `npm run lint`   | exit 0, no errors          |
| Tests     | `npm test`       | 18+ tests pass             |
| Build     | `npm run build`  | exit 0, dist/ regenerated  |

## Scope

**In scope** (the only files you should modify):
- `server.ts`
- `.env.example` (comment updates only, if the APP_URL semantics need clarifying)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/auth.ts` — the client-side implicit flow (`response_type: 'token'`)
  is a separate sign-in path; changing it is plan 002's concern, not this one.
- `src/lib/errorLog.ts`, `src/lib/calendar.ts` — unrelated.
- Do not add session storage, cookies, or a database — the token must keep
  flowing to the browser exactly as today; only the delivery channel is
  hardened.

## Git workflow

- Do NOT commit, push, or open a PR — the orchestrator reviews the working
  tree. (If your operator explicitly instructs commits, use the repo's
  conventional-commit style, e.g. `fix(auth): validate oauth redirect_uri against APP_URL`.)

## Steps

### Step 1: Derive the allowed origin from configuration

At the top of `startServer()` in `server.ts` (near `const PORT = 3000;`,
line 10), compute the app's own origin once:

```ts
const APP_URL = process.env.APP_URL || '';
let appOrigin = '';
try {
  appOrigin = APP_URL ? new URL(APP_URL).origin : '';
} catch {
  console.error('[server-error] APP_URL is not a valid URL; OAuth redirect validation will reject all custom redirect_uris');
}
```

Add a helper that validates a candidate redirect URI:

```ts
function isAllowedRedirectUri(candidate: string): boolean {
  if (!appOrigin) return false;
  try {
    const url = new URL(candidate);
    return url.origin === appOrigin && url.pathname.replace(/\/+$/, '') === '/auth/callback';
  } catch {
    return false;
  }
}
```

**Verify**: `npm run lint` → exit 0.

### Step 2: Validate `redirect_uri` in `/api/auth/url`

In the `/api/auth/url` handler (`server.ts:85`), after the existing
`!redirect_uri` check, reject anything that fails the allow-list:

```ts
if (!isAllowedRedirectUri(redirect_uri as string)) {
  return res.status(400).json({ error: 'redirect_uri is not an allowed callback URL for this app' });
}
```

**Verify**: `npm run lint` → exit 0.

### Step 3: Validate `state` in the callback handler

In the callback (`server.ts:111-118`), replace the unconditional trust of
`state` with validation. When `state` is present it must pass the same
allow-list; when absent keep the existing host-derived fallback:

```ts
const stateUri = typeof state === 'string' ? state : '';
const redirectUri = stateUri
  ? stateUri
  : `${req.protocol}://${req.get('host')}/auth/callback`;

if (stateUri && !isAllowedRedirectUri(stateUri)) {
  return res.status(400).send('Invalid OAuth state');
}
```

**Verify**: `npm run lint` → exit 0.

### Step 4: Pin the postMessage target origin

In the success HTML (`server.ts:189-202`), replace the `'*'` target with the
app origin, and fall back to a plain "you may close this window" message when
the origin is unknown (never emit a wildcard):

```ts
const postMessageOrigin = appOrigin || null;
```

In the template, change the script block so the target origin is injected as
a JSON string and the message is only posted when an origin exists:

```ts
window.opener.postMessage({
  type: 'OAUTH_AUTH_SUCCESS',
  token: ${JSON.stringify(accessToken)},
  user: ${JSON.stringify(userProfile)}
}, ${JSON.stringify(postMessageOrigin)});
```

Note: `postMessage` with literal `null`/`'null'` is wrong — when
`postMessageOrigin` is falsy, skip the postMessage call entirely and just
show the success text plus close button. Implement this by emitting the
postMessage statement conditionally from the server side (build the small
script string in TS), not by posting to `'null'`.

**Verify**: `npm run lint` → exit 0; `npm run build` → exit 0.

### Step 5: Smoke-test the server manually

Run `APP_URL=http://localhost:3000 GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y npx tsx server.ts`
in the background, then:

- `curl 'http://localhost:3000/api/auth/url?redirect_uri=http://localhost:3000/auth/callback'`
  → HTTP 200, JSON with a Google URL.
- `curl 'http://localhost:3000/api/auth/url?redirect_uri=https://evil.example.com/cb'`
  → HTTP 400 with the not-allowed error.
- `curl 'http://localhost:3000/auth/callback?code=fake&state=https://evil.example.com/cb'`
  → HTTP 400 "Invalid OAuth state".

Kill the server afterwards. **Verify**: all three responses match.

## Test plan

This repo has no server-route test harness today (vitest only covers
`src/lib/calendar.test.ts`). Do NOT build a new server test harness in this
plan — that is plan 004. Instead, the manual curl smoke test in Step 5 is
the verification of record, plus the existing suite must stay green:

- `npm test` → all 18 existing tests still pass (this plan touches no
  tested module, so any failure means an accidental out-of-scope edit).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 (18 tests)
- [ ] `npm run build` exits 0
- [ ] `grep -n "postMessage" server.ts` shows no `'*'` target origin
- [ ] `grep -n "isAllowedRedirectUri" server.ts` shows the helper and both call sites
- [ ] The three curl checks in Step 5 behave as specified
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `server.ts:85-118` or `server.ts:189-202` doesn't match the
  excerpts above (drift since `482d6e1`).
- You discover the client actually depends on receiving the token via
  postMessage from a *different* origin than `APP_URL` (search
  `src/` for `OAUTH_AUTH_SUCCESS` — if a listener expects cross-origin
  delivery, report it instead of proceeding).
- `APP_URL` semantics turn out to be something other than the app's public
  origin (check deployment docs/scripts).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If the app is ever served behind multiple public origins, `isAllowedRedirectUri`
  must become a list — keep the helper pure so that change stays local.
- The OAuth callback HTML template interpolates `error.message` into the
  error page (`server.ts:213`) without HTML-escaping. That is a separate,
  lower-severity finding deliberately left out of this plan; a reviewer
  should not ask for it here, but a follow-up may escape it.
- When plan 004 (server route tests) lands, the first tests to write are the
  three curl cases from Step 5 as automated supertest cases.
