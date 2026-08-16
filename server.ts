import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // The app's own public origin, derived from APP_URL. Used to pin the OAuth
  // postMessage target and to allow-list redirect_uri/state values.
  const APP_URL = process.env.APP_URL || '';
  let appOrigin = '';
  try {
    appOrigin = APP_URL ? new URL(APP_URL).origin : '';
  } catch {
    console.error('[server-error] APP_URL is not a valid URL; OAuth redirect validation will reject all custom redirect_uris');
  }

  // Validate a candidate OAuth redirect URI against the app's own origin.
  function isAllowedRedirectUri(candidate: string): boolean {
    if (!appOrigin) return false;
    try {
      const url = new URL(candidate);
      return url.origin === appOrigin && url.pathname.replace(/\/+$/, '') === '/auth/callback';
    } catch {
      return false;
    }
  }

  // Log any uncaught exception / unhandled rejection to stdout so it is
  // observable in docker logs / Cloud Run / hosted VM stdout.
  process.on('uncaughtException', (err) => {
    console.error('[server-error] uncaughtException:', err?.message, err?.stack);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[server-error] unhandledRejection:', reason);
  });

  // Configure JSON and URLencoded middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes first
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Client -> server error reporting. The browser POSTs sanitized error
  // details here; we write them to stdout and answer 204. Never crashes.
  const MAX_FIELD_BYTES = 4096;
  const MAX_TOTAL_BYTES = 16384;

  function sanitizeField(value: unknown): string {
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

  app.post('/api/error-log', (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const fields: Record<string, string> = {};
      let total = 0;
      for (const key of ['message', 'stack', 'url', 'userAgent', 'hint'] as const) {
        let val = sanitizeField(body[key]);
        const remaining = MAX_TOTAL_BYTES - total;
        if (remaining <= 0) {
          val = '';
        } else if (val.length > remaining) {
          val = val.slice(0, remaining);
        }
        fields[key] = val;
        total += val.length;
      }

      console.error('[client-error]', {
        message: fields.message,
        stack: fields.stack,
        url: fields.url,
        userAgent: fields.userAgent,
        hint: fields.hint,
        ts: new Date().toISOString(),
      });

      res.status(204).end();
    } catch (err) {
      // The reporting endpoint itself must never crash.
      console.error('[client-error] failed to process report:', err);
      res.status(204).end();
    }
  });

  // API endpoint for retrieving Google authorization URL
  app.get('/api/auth/url', (req, res) => {
    const { redirect_uri } = req.query;
    if (!redirect_uri) {
      return res.status(400).json({ error: 'Missing redirect_uri query parameter' });
    }

    if (!isAllowedRedirectUri(redirect_uri as string)) {
      return res.status(400).json({ error: 'redirect_uri is not an allowed callback URL for this app' });
    }

    const client_id = process.env.GOOGLE_CLIENT_ID;
    if (!client_id) {
      return res.status(500).json({ error: 'GOOGLE_CLIENT_ID environment variable is not configured on the server.' });
    }

    const oauth2Url = 'https://accounts.google.com/o/oauth2/v2/auth';
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

  // OAuth Google Callback handler which exchanges auth code for token
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    const stateUri = typeof state === 'string' ? state : '';
    const redirectUri = stateUri
      ? stateUri
      : `${req.protocol}://${req.get('host')}/auth/callback`;

    if (stateUri && !isAllowedRedirectUri(stateUri)) {
      return res.status(400).send('Invalid OAuth state');
    }

    try {
      const client_id = process.env.GOOGLE_CLIENT_ID;
      const client_secret = process.env.GOOGLE_CLIENT_SECRET;

      if (!client_id || !client_secret) {
        throw new Error('Google OAuth configuration is incomplete on this server.');
      }

      // Exchange Authorization Code for Access Token using raw fetch
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const tokenParams = new URLSearchParams({
        client_id,
        client_secret,
        code: code as string,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        throw new Error(`Token exchange failed (status ${tokenRes.status}): ${errorText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Fetch User profile info from Google
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      let userProfile = {
        displayName: 'Google User',
        email: '',
        photoURL: '',
      };

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        userProfile = {
          displayName: profileData.name || profileData.given_name || 'Google User',
          email: profileData.email || '',
          photoURL: profileData.picture || '',
        };
      }

      // Successful token exchange and profile fetch: send postMessage to parent window and close popup
      const postMessageOrigin = appOrigin || null;

      // Build the success-page script. Only postMessage when we have a pinned
      // origin; never emit a wildcard target ('*') or a literal 'null'.
      const postMessageScript = postMessageOrigin
        ? `if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH_AUTH_SUCCESS',
                  token: ${JSON.stringify(accessToken)},
                  user: ${JSON.stringify(userProfile)}
                }, ${JSON.stringify(postMessageOrigin)});
                setTimeout(() => {
                  window.close();
                }, 1000);
              } else {
                window.location.href = '/';
              }`
        : `if (window.opener) {
                window.close();
              } else {
                window.location.href = '/';
              }`;

      res.send(`
        <html>
          <head>
            <title>Authentication Successful</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #F8FAFC; color: #1e293b; text-align: center;">
            <div style="padding: 2rem; background: white; border-radius: 1rem; border: 1px solid #e2e8f0; max-width: 400px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: #dcfce7; color: #15803d; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 1rem;">✓</div>
              <h1 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; color: #0f172a;">เชื่อมต่อรับสิทธิ์สำเร็จ!</h1>
              <p style="font-size: 0.875rem; color: #64748b; margin-bottom: 1.5rem; line-height: 1.5;">แอปได้รับสิทธิ์การเชื่อมต่อ Google Calendar ของคุณเรียบร้อยแล้ว หน้าต่างนี้จะปิดตัวลงโดยอัตโนมัติ...</p>
              <button onclick="window.close()" style="background-color: #4f46e5; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: background-color 0.2s;">ปิดหน้าต่างนี้</button>
            </div>
            <script>
              ${postMessageScript}
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #FFF5F5;">
            <div style="border: 1px solid #FEB2B2; padding: 20px; border-radius: 8px; background-color: #FFF; max-width: 500px;">
              <h2 style="color: #9B2C2C; margin-top: 0;">เกิดข้อผิดพลาดในการลงชื่อเข้าใช้ (OAuth Error)</h2>
              <p style="color: #4A5568; font-size: 14px; line-height: 1.5;">${error instanceof Error ? error.message : 'Unknown authentication error'}</p>
              <p style="color: #718096; font-size: 12px;">โปรดตรวจสอบว่าได้ตั้งค่า Google Client ID และ Client Secret ใน Secrets Panel เรียบร้อยแล้ว</p>
              <button onclick="window.close()" style="background-color: #E53E3E; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">ปิดหน้าต่าง</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  // Vite middleware / Production static files handler
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Express error handler: log uncaught /api errors to stdout without
  // leaking stack traces to the client. Must be registered last (4-arg).
  app.use((err: unknown, req: any, res: any, _next: any) => {
    const e = err as any;
    console.error('[server-error]', {
      message: e?.message ?? String(err),
      stack: e?.stack,
      method: req.method,
      url: req.originalUrl,
      ts: new Date().toISOString(),
    });
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: 'Internal Server Error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
