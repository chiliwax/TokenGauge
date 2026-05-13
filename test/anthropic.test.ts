import test from 'node:test';
import assert from 'node:assert/strict';

import { AnthropicProvider } from '../src/providers/anthropic.js';

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

test('fetches Claude OAuth usage with CodexBar endpoint headers', async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = '';
  let seenHeaders = new Headers();

  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      seenUrl = requestUrl(input);
      seenHeaders = new Headers(init?.headers);

      return new Response(JSON.stringify({
        five_hour: { utilization: 0.25, resets_at: '2099-01-01T00:00:00Z' },
        seven_day: { utilization: 80 },
        seven_day_opus: { utilization: 0.5 },
        extra_usage: {
          is_enabled: true,
          monthly_limit: 100,
          used_credits: 12.5,
          utilization: 0.125,
          currency: 'USD',
        },
      }), { status: 200 });
    };

    const provider = new AnthropicProvider({ type: 'oauth', access: 'claude-access-token' }, 'Claude Test');
    const usage = await provider.fetchUsage();

    assert.equal(seenUrl, 'https://api.anthropic.com/api/oauth/usage');
    assert.equal(seenHeaders.get('Authorization'), 'Bearer claude-access-token');
    assert.equal(seenHeaders.get('anthropic-beta'), 'oauth-2025-04-20');
    assert.equal(seenHeaders.get('Accept'), 'application/json');
    assert.equal(usage.providerName, 'Claude Test');
    assert.equal(usage.credits, 'Extra usage: $12.5/$100');
    assert.deepEqual(usage.sections.map(section => ({
      label: section.label,
      usedPercent: section.usedPercent,
      current: section.current,
      max: section.max,
      remaining: section.remaining,
      displayValue: section.displayValue,
    })), [
      {
        label: '5h window',
        usedPercent: 25,
        current: undefined,
        max: undefined,
        remaining: undefined,
        displayValue: undefined,
      },
      {
        label: 'Weekly',
        usedPercent: 80,
        current: undefined,
        max: undefined,
        remaining: undefined,
        displayValue: undefined,
      },
      {
        label: 'Opus weekly',
        usedPercent: 50,
        current: undefined,
        max: undefined,
        remaining: undefined,
        displayValue: undefined,
      },
      {
        label: 'Extra usage',
        usedPercent: 12.5,
        current: 12.5,
        max: 100,
        remaining: 87.5,
        displayValue: '$12.5/$100',
      },
    ]);
    assert.ok((usage.sections[0].resetInSeconds ?? 0) > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps Anthropic API keys as a limited placeholder', async () => {
  const usage = await new AnthropicProvider('sk-ant-api-key').fetchUsage();

  assert.deepEqual(usage, {
    providerName: 'Claude / Anthropic',
    sections: [],
    credits: 'API key configured — Claude usage requires OpenCode OAuth import',
  });
});

test('redacts provider secrets from Claude OAuth error bodies', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({
      error: 'Bearer leaked-token access_token: "also-leaked" sk-ant-testsecret',
    }), { status: 403 });

    const provider = new AnthropicProvider({ type: 'oauth', access: 'real-access-token' });

    await assert.rejects(
      provider.fetchUsage(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Bearer \[redacted\]/);
        assert.match(error.message, /access_token=\[redacted\]/);
        assert.match(error.message, /sk-ant-\[redacted\]/);
        assert.doesNotMatch(error.message, /leaked-token|also-leaked|testsecret|real-access-token/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
