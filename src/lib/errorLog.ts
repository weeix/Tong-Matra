/**
 * Best-effort client -> server error reporting.
 *
 * `reportError` fire-and-forgets a sanitized POST to /api/error-log so that
 * client-side failures (e.g. a Google Calendar sync failure while adding a
 * study plan) reach the server's stdout and become observable in docker logs /
 * Cloud Run / hosted VM. It never throws and never blocks the UI.
 */

const ENDPOINT = '/api/error-log';
const MAX_FIELD_BYTES = 4096;

let listenersWired = false;

function sanitize(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.slice(0, MAX_FIELD_BYTES);
}

function toPayload(err: unknown, hint?: string) {
  const e = err as any;
  return {
    message: sanitize(e?.message ?? e),
    stack: sanitize(e?.stack),
    url: sanitize(typeof window !== 'undefined' ? window.location.href : ''),
    userAgent: sanitize(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    hint: sanitize(hint),
  };
}

/**
 * Report an error to the server. Fire-and-forget: never throws, never awaits,
 * never blocks the UI. Safe to call from any catch block.
 */
export function reportError(err: unknown, hint?: string): void {
  try {
    const payload = toPayload(err, hint);
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // best-effort: ignore network/reporting failures
    });
  } catch {
    // never throw
  }
}

function wireGlobalListeners(): void {
  if (listenersWired || typeof window === 'undefined') return;
  listenersWired = true;

  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, 'window.onerror');
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, 'window.onunhandledrejection');
  });
}

// Wire the global listeners exactly once at module load.
wireGlobalListeners();
