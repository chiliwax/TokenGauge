import test from 'node:test';
import assert from 'node:assert/strict';

import { beginChatGptDeviceAuth, completeChatGptDeviceAuth, refreshChatGptAccessToken } from '../src/openai-oauth.js';

test('starts ChatGPT device authorization', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({
      device_auth_id: 'device-123',
      user_code: 'ABCD-EFGH',
      interval: '2',
    }), { status: 200 });

    assert.deepEqual(await beginChatGptDeviceAuth(), {
      deviceAuthId: 'device-123',
      userCode: 'ABCD-EFGH',
      intervalMs: 2000,
      verificationUrl: 'https://auth.openai.com/codex/device',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completes ChatGPT device authorization after polling', async () => {
  const originalFetch = globalThis.fetch;
  const issuedAt = Date.now();
  let tokenPollCount = 0;

  try {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url === 'https://auth.openai.com/api/accounts/deviceauth/token') {
        tokenPollCount += 1;
        if (tokenPollCount === 1) return new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 400 });
        return new Response(JSON.stringify({
          authorization_code: 'authorization-code',
          code_verifier: 'code-verifier',
        }), { status: 200 });
      }

      if (url === 'https://auth.openai.com/oauth/token') {
        return new Response(JSON.stringify({
          access_token: jwt({ chatgpt_account_id: 'account-123' }),
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'unexpected URL' }), { status: 404 });
    };

    const entry = await completeChatGptDeviceAuth({
      deviceAuthId: 'device-123',
      userCode: 'ABCD-EFGH',
      intervalMs: 0,
      verificationUrl: 'https://auth.openai.com/codex/device',
    });

    assert.equal(entry.provider, 'chatgpt');
    assert.equal(entry.type, 'oauth');
    assert.equal(entry.accountId, 'account-123');
    assert.equal(entry.refresh, 'refresh-token');
    assert.equal(tokenPollCount, 2);
    assert.ok(entry.expires != null && entry.expires >= issuedAt + 3600 * 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshes ChatGPT access tokens', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      assert.equal(url, 'https://auth.openai.com/oauth/token');
      return new Response(JSON.stringify({
        access_token: jwt({ chatgpt_account_id: 'account-456' }),
        expires_in: 1800,
      }), { status: 200 });
    };

    const entry = await refreshChatGptAccessToken('existing-refresh-token');
    assert.equal(entry.provider, 'chatgpt');
    assert.equal(entry.key, jwt({ chatgpt_account_id: 'account-456' }));
    assert.equal(entry.refresh, 'existing-refresh-token');
    assert.equal(entry.accountId, 'account-456');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jwt(payload: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}
