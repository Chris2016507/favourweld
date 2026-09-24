import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const buildDbMock = (overrides?: Record<string, unknown>) => {
  const state = {
    lastInvoice: { id: 1, total: 1000, amount_paid: 0, balance: 1000, status: 'unpaid' },
    payments: [] as Array<Record<string, unknown>>,
    ...overrides,
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T = Record<string, unknown>>() {
              if (sql.includes('SELECT id, total, amount_paid, balance, status FROM invoices WHERE id = ?')) {
                return state.lastInvoice as T;
              }

              if (sql.includes('SELECT id, provider_reference, status, amount FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1')) {
                return null as T | null;
              }

              if (sql.includes('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = ? AND status = \'completed\'')) {
                return { total_paid: 1000 } as T;
              }

              return null as T | null;
            },
            async run() {
              if (sql.includes('INSERT INTO payments')) {
                state.payments.push({ sql, args: [...args] });
              }
              return { success: true };
            },
          };
        },
      };
    },
  };

  return db;
};

async function callWorker(path: string, init?: RequestInit, customEnv: Record<string, unknown> = {}) {
  const request = new IncomingRequest(`http://example.com${path}`, init);
  const ctx = createExecutionContext();
  const mergedEnv = {
    ...env,
    DB: buildDbMock(),
    ...customEnv,
  } as any;

  const response = await worker.fetch(request, mergedEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function signPayload(secret: string, payload: unknown) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const digest = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload))
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

describe('FAVOURWELD worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the health payload', async () => {
    const response = await callWorker('/api/health');

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      service: 'FAVOURWELD ELECTRONICS',
    });
  });

  it('rejects IntaSend initiation when secrets are missing', async () => {
    const response = await callWorker('/api/payments/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: 1, amount: 1000, phone: '254712345678' }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('IntaSend settings are missing'),
    });
  });

  it('initiates IntaSend checkout when configuration is present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://sandbox.intasend.com/checkout/chk_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await callWorker('/api/payments/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: 1, amount: 1000, phone: '254712345678', email: 'customer@example.com' }),
    }, {
      INTASEND_API_KEY: 'ISPubKey_test',
      INTASEND_API_BASE_URL: 'https://sandbox.intasend.com',
      INTASEND_WEBHOOK_SECRET: 'webhook-secret',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      reference: expect.stringContaining('FW-INVOICE-1-'),
      checkout_url: 'https://sandbox.intasend.com/checkout/chk_123',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://sandbox.intasend.com/api/v1/checkout/',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('rejects an IntaSend callback with an invalid challenge', async () => {
    const response = await callWorker('/api/payments/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'COMPLETE',
        value: 1000,
        currency: 'KES',
        api_ref: 'FW-INVOICE-1-test',
        challenge: 'wrong-secret',
      }),
    }, {
      INTASEND_WEBHOOK_SECRET: 'webhook-secret',
      DB: buildDbMock(),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Invalid IntaSend webhook challenge.',
    });
  });

  it('accepts a valid IntaSend callback and updates the invoice balance', async () => {
    const payload = {
      state: 'COMPLETE',
      value: 1000,
      currency: 'KES',
      api_ref: 'FW-INVOICE-1-test',
      challenge: 'webhook-secret',
    };

    const response = await callWorker('/api/payments/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, {
      INTASEND_WEBHOOK_SECRET: 'webhook-secret',
      DB: buildDbMock(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      processed: true,
    });
  });
});
