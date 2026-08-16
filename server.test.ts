import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  // Set env before importing server.ts so its module-scope dotenv.config()
  // and createApp() read these values. NODE_ENV=production skips the Vite dev
  // middleware (which would otherwise boot a Vite server inside the test
  // worker). APP_URL pins the OAuth allow-list origin; GOOGLE_CLIENT_ID lets
  // the /api/auth/url happy path reach the URL-building branch.
  process.env.NODE_ENV = 'production';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

  const { createApp } = await import('./server');
  app = await createApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('server routes', () => {
  it('GET /api/health returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('POST /api/error-log logs a normal body and returns 204', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/error-log')
      .send({ message: 'something broke', url: '/foo' });

    expect(res.status).toBe(204);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[client-error]',
      expect.objectContaining({
        message: 'something broke',
        url: '/foo',
      }),
    );
  });

  it('POST /api/error-log truncates oversized fields to MAX_FIELD_BYTES', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/error-log')
      .send({ message: 'a'.repeat(5000) });

    expect(res.status).toBe(204);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0][1] as { message: string };
    expect(logged.message).toHaveLength(4096);
  });

  it('POST /api/error-log returns 204 for a non-object body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/error-log')
      .set('Content-Type', 'text/plain')
      .send('not json at all');

    expect(res.status).toBe(204);
  });

  it('GET /api/auth/url without redirect_uri returns 400', async () => {
    const res = await request(app).get('/api/auth/url');
    expect(res.status).toBe(400);
  });

  it('GET /api/auth/url allow-lists the redirect_uri', async () => {
    const allowed = await request(app)
      .get('/api/auth/url')
      .query({ redirect_uri: 'http://localhost:3000/auth/callback' });
    expect(allowed.status).toBe(200);
    const url = new URL(allowed.body.url);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/callback',
    );

    const disallowed = await request(app)
      .get('/api/auth/url')
      .query({ redirect_uri: 'https://evil.example.com/cb' });
    expect(disallowed.status).toBe(400);
  });

  it('GET /auth/callback without code returns 400', async () => {
    const res = await request(app).get('/auth/callback');
    expect(res.status).toBe(400);
  });
});
