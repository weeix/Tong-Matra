# Plan 002: Align token storage with the app's session-only security claim

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 482d6e1..HEAD -- src/lib/auth.ts src/App.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `482d6e1`, 2026-08-16

## Why this matters

`src/lib/auth.ts` persists the Google access token and user profile to
**both** `sessionStorage` and `localStorage` (`setStoredAuth`, lines 24-37).
`localStorage` survives tab close and is readable by any script running on
the origin for an unlimited lifetime — including any future XSS payload.

This directly contradicts the security promise the UI makes to users on the
Add-Plan page (`src/App.tsx:399`): "บัญชีปฏิทินของคุณจะเชื่อมโยงเฉพาะระยะเวลาที่เปิดแท็บนี้อยู่เท่านั้น
หลังปิดแท็บระบบจะคืนความปลอดภัยและถอนการจดจำทันที" ("your calendar account is
linked only while this tab is open; after closing the tab the system forgets
it immediately"). Today that claim is false: the token persists across
sessions in `localStorage`. Either the code or the claim is wrong; the code
is the cheaper and safer side to fix.

## Current state

- `src/lib/auth.ts` — client auth helpers. Relevant excerpts:

`src/lib/auth.ts:8-21` — read path checks sessionStorage first, then localStorage:
```ts
export const getStoredAuth = (): { user: CustomUser | null; token: string | null } => {
  if (typeof window === 'undefined') {
    return { user: null, token: null };
  }
  try {
    const token = sessionStorage.getItem('google_calendar_token') || localStorage.getItem('google_calendar_token');
    const userStr = sessionStorage.getItem('auth_user') || localStorage.getItem('auth_user');
    const user = userStr ? JSON.parse(userStr) : null;
    return { user, token };
  } catch (error) {
    console.error('Failed to parse stored auth user:', error);
    return { user: null, token: null };
  }
};
```

`src/lib/auth.ts:24-37` — write path writes both stores:
```ts
export const setStoredAuth = (user: CustomUser | null, token: string | null) => {
  if (typeof window === 'undefined') return;
  if (token && user) {
    sessionStorage.setItem('google_calendar_token', token);
    sessionStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('google_calendar_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('google_calendar_token');
    sessionStorage.removeItem('auth_user');
    localStorage.removeItem('google_calendar_token');
    localStorage.removeItem('auth_user');
  }
};
```

- Callers: `src/App.tsx:53` (`getStoredAuth` on mount) and
  `src/lib/auth.ts:118` (`setStoredAuth` after the implicit-flow callback).
  Both go through these two functions — no other code touches these storage
  keys (verify with `grep -rn "google_calendar_token\|auth_user" src/`).
- Repo conventions: plain exported `const` arrow functions, Thai-language
  user-facing strings, `console.error` for diagnostics. Match that style.

## Commands you will need

| Purpose   | Command          | Expected on success   |
|-----------|------------------|-----------------------|
| Typecheck | `npm run lint`   | exit 0, no errors     |
| Tests     | `npm test`       | 18+ tests pass        |
| Build     | `npm run build`  | exit 0                |

## Scope

**In scope** (the only files you should modify):
- `src/lib/auth.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/App.tsx` — the security claim text at line 399 is already correct
  once this plan lands; do not reword it.
- `server.ts` — the server-side OAuth flow is plan 001's scope.
- Do not add token refresh, expiry tracking, or revocation — out of scope.

## Git workflow

- Do NOT commit, push, or open a PR — the orchestrator reviews the working
  tree. (If your operator explicitly instructs commits, use the repo's
  conventional-commit style, e.g. `fix(auth): store google token in sessionStorage only`.)

## Steps

### Step 1: Write to sessionStorage only; keep localStorage cleanup

In `setStoredAuth`, remove the two `localStorage.setItem(...)` lines from
the success branch. KEEP the `localStorage.removeItem(...)` lines in the
else branch, and ALSO remove the localStorage keys in the success branch —
this upgrades existing users who still have stale tokens in localStorage
from previous versions:

```ts
export const setStoredAuth = (user: CustomUser | null, token: string | null) => {
  if (typeof window === 'undefined') return;
  // Always clear any legacy localStorage copies so old persisted tokens
  // from previous versions are wiped on next login/logout.
  localStorage.removeItem('google_calendar_token');
  localStorage.removeItem('auth_user');
  if (token && user) {
    sessionStorage.setItem('google_calendar_token', token);
    sessionStorage.setItem('auth_user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('google_calendar_token');
    sessionStorage.removeItem('auth_user');
  }
};
```

**Verify**: `npm run lint` → exit 0.

### Step 2: Migrate the read path with a one-time cleanup

In `getStoredAuth`, stop trusting localStorage as a fallback, and wipe any
legacy copy found there so a stale token cannot be resurrected:

```ts
export const getStoredAuth = (): { user: CustomUser | null; token: string | null } => {
  if (typeof window === 'undefined') {
    return { user: null, token: null };
  }
  try {
    // Legacy cleanup: tokens used to be mirrored to localStorage. Remove any
    // leftover copies instead of honoring them.
    localStorage.removeItem('google_calendar_token');
    localStorage.removeItem('auth_user');
    const token = sessionStorage.getItem('google_calendar_token');
    const userStr = sessionStorage.getItem('auth_user');
    const user = userStr ? JSON.parse(userStr) : null;
    return { user, token };
  } catch (error) {
    console.error('Failed to parse stored auth user:', error);
    return { user: null, token: null };
  }
};
```

**Verify**: `npm run lint` → exit 0; `npm run build` → exit 0.

### Step 3: Confirm no other storage-key users

Run `grep -rn "google_calendar_token\|auth_user" src/ server.ts` and confirm
the only remaining references are inside `src/lib/auth.ts`.

**Verify**: grep output shows matches only in `src/lib/auth.ts`.

## Test plan

- Existing suite must stay green: `npm test` → 18 tests pass (this plan
  touches no tested module).
- Manual verification (no browser automation exists in this repo):
  1. `npm run dev`, sign in, confirm the app loads sessions.
  2. In DevTools → Application: `sessionStorage` has both keys;
     `localStorage` has neither.
  3. Close the tab, reopen the URL in a new tab → app shows the login page
     (sessionStorage did not survive), proving the UI claim is now true.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 (18 tests)
- [ ] `npm run build` exits 0
- [ ] `grep -n "localStorage.setItem" src/lib/auth.ts` returns no matches
- [ ] `grep -rn "google_calendar_token" src/ | grep -v "src/lib/auth.ts"` returns no matches
- [ ] Manual DevTools check in Test plan step 2 passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live `src/lib/auth.ts` (drift since
  `482d6e1`).
- You find another module reading `localStorage` auth keys directly (the
  grep in Step 3 shows a hit outside `src/lib/auth.ts`) — that module's
  behavior change needs a human decision.
- Product actually wants "remember me across tabs" behavior — that
  contradicts the in-app security claim and needs a maintainer decision,
  not an executor judgment call.

## Maintenance notes

- The user experience change is real: users now re-authenticate after
  closing the tab. That is exactly what the UI already promises, but a
  reviewer should consciously accept it.
- If a future "remember me" feature is wanted, it must be opt-in UI and
  should reuse the legacy-cleanup pattern here (explicit key management in
  one module only).
- Google implicit-flow tokens expire in ~1 hour anyway; session-only storage
  bounds the exposure window of any token leak to the tab lifetime.
