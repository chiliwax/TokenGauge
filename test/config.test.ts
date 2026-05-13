import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { detectFromOpenCode } from '../src/config.js';

async function withAuthFile(content: unknown, run: (path: string) => void | Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'tokengauge-auth-'));
  const path = join(dir, 'auth.json');
  try {
    await writeFile(path, JSON.stringify(content), 'utf-8');
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('imports OpenCode OpenAI OAuth as ChatGPT Plus/Pro', async () => {
  await withAuthFile({
    openai: {
      type: 'oauth',
      access: 'oauth-access-token',
      accountId: 'acc_123',
      refresh: 'refresh-token',
      expires: 123456789,
    },
  }, (path) => {
    assert.deepEqual(detectFromOpenCode(path), [
      {
        provider: 'chatgpt',
        key: 'oauth-access-token',
        type: 'oauth',
        accountId: 'acc_123',
        refresh: 'refresh-token',
        expires: 123456789,
      },
    ]);
  });
});

test('imports OpenCode OpenAI API entries as OpenAI API', async () => {
  await withAuthFile({
    openai: {
      type: 'api',
      key: 'sk-admin',
    },
  }, (path) => {
    assert.deepEqual(detectFromOpenCode(path), [
      {
        provider: 'openai',
        key: 'sk-admin',
      },
    ]);
  });
});

test('keeps legacy OpenCode apiKey entries as OpenAI API', async () => {
  await withAuthFile({
    openai: {
      type: 'apiKey',
      key: 'sk-legacy',
    },
  }, (path) => {
    assert.deepEqual(detectFromOpenCode(path), [
      {
        provider: 'openai',
        key: 'sk-legacy',
      },
    ]);
  });
});

test('imports OpenCode Anthropic OAuth as Claude / Anthropic', async () => {
  await withAuthFile({
    anthropic: {
      type: 'oauth',
      access: 'claude-access-token',
      accountId: 'claude-account',
      expires: 987654321,
    },
  }, (path) => {
    assert.deepEqual(detectFromOpenCode(path), [
      {
        provider: 'anthropic',
        key: 'claude-access-token',
        type: 'oauth',
        accountId: 'claude-account',
        expires: 987654321,
      },
    ]);
  });
});

test('ignores malformed Anthropic OAuth entries from OpenCode', async () => {
  await withAuthFile({
    anthropic: {
      type: 'oauth',
      access: 123,
      refresh: false,
      expires: 'soon',
    },
  }, (path) => {
    assert.deepEqual(detectFromOpenCode(path), []);
  });
});

test('filters malformed optional OpenCode auth fields', async () => {
  await withAuthFile({
    openai: {
      type: 'oauth',
      access: 'oauth-access-token',
      accountId: 123,
      refresh: false,
      expires: 'soon',
    },
    openrouter: {
      type: 'api',
      key: 456,
    },
    anthropic: {
      type: 'oauth',
      access: 'claude-access-token',
      accountId: false,
      refresh: 'not-imported',
      expires: 'soon',
    },
  }, (path) => {
    assert.deepEqual(detectFromOpenCode(path), [
      {
        provider: 'chatgpt',
        key: 'oauth-access-token',
        type: 'oauth',
      },
      {
        provider: 'anthropic',
        key: 'claude-access-token',
        type: 'oauth',
      },
    ]);
  });
});
