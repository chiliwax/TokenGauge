import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOpenCodeCookieHeader,
  normalizeOpenCodeWorkspaceId,
  parseOpenCodeGoSubscription,
  parseOpenCodeSubscription,
  parseOpenCodeWorkspaceIds,
} from '../src/providers/opencode-web.js';

test('normalizes OpenCode cookie headers without dropping browser cookies', () => {
  assert.equal(
    normalizeOpenCodeCookieHeader('Cookie: theme=dark; auth=abc123; ignored=yes; __Host-auth=host456'),
    'theme=dark; auth=abc123; ignored=yes; __Host-auth=host456',
  );
  assert.equal(
    normalizeOpenCodeCookieHeader("-H 'Cookie: __Host-auth=host456; other=no'"),
    '__Host-auth=host456; other=no',
  );
});

test('keeps nonstandard OpenCode session cookies when known auth names are absent', () => {
  assert.equal(
    normalizeOpenCodeCookieHeader('Cookie: session_token=abc123; workspace=wrk_123'),
    'session_token=abc123; workspace=wrk_123',
  );
  assert.equal(normalizeOpenCodeCookieHeader('not a cookie header'), null);
});

test('accepts a raw OpenCode auth cookie value', () => {
  assert.equal(
    normalizeOpenCodeCookieHeader('Fe26.2*kJp0%2Fvalue.MxOQ'),
    'auth=Fe26.2*kJp0%2Fvalue.MxOQ; __Host-auth=Fe26.2*kJp0%2Fvalue.MxOQ',
  );
});

test('normalizes raw and URL workspace identifiers', () => {
  assert.equal(normalizeOpenCodeWorkspaceId('wrk_abc123'), 'wrk_abc123');
  assert.equal(
    normalizeOpenCodeWorkspaceId('https://opencode.ai/workspace/wrk_url123/go'),
    'wrk_url123',
  );
  assert.equal(normalizeOpenCodeWorkspaceId('workspace=wrk_embedded789'), 'wrk_embedded789');
  assert.equal(normalizeOpenCodeWorkspaceId('none'), null);
});

test('extracts workspace ids from JSON and JS-like payloads', () => {
  assert.deepEqual(
    parseOpenCodeWorkspaceIds(JSON.stringify({ data: [{ id: 'wrk_json1' }, { id: 'wrk_json2' }] })),
    ['wrk_json1', 'wrk_json2'],
  );
  assert.deepEqual(
    parseOpenCodeWorkspaceIds('export default [{ id: "wrk_js1" }, { name: "Workspace", id: "wrk_js2" }]'),
    ['wrk_js1', 'wrk_js2'],
  );
});

test('parses general OpenCode JSON usage payloads', () => {
  const usage = parseOpenCodeSubscription(JSON.stringify({
    rollingUsage: { usagePercent: 12.5, resetInSec: 300 },
    weeklyUsage: { usagePercent: 64, resetInSec: 900 },
  }));

  assert.equal(usage.rollingUsage.usedPercent, 12.5);
  assert.equal(usage.rollingUsage.resetInSeconds, 300);
  assert.equal(usage.weeklyUsage.usedPercent, 64);
  assert.equal(usage.weeklyUsage.resetInSeconds, 900);
});

test('parses nested OpenCode JSON usage payloads', () => {
  const usage = parseOpenCodeSubscription(JSON.stringify({
    data: {
      payload: {
        usage: {
          rolling_window: { used: 5, limit: 20, resetInSeconds: 120 },
          weekly_window: { percent: 0.4, resetSeconds: 600 },
        },
      },
    },
  }));

  assert.equal(usage.rollingUsage.usedPercent, 25);
  assert.equal(usage.rollingUsage.resetInSeconds, 120);
  assert.equal(usage.weeklyUsage.usedPercent, 40);
  assert.equal(usage.weeklyUsage.resetInSeconds, 600);
});

test('parses OpenCode usage when JSON is nested as a string', () => {
  const usage = parseOpenCodeSubscription(JSON.stringify({
    data: JSON.stringify({
      rollingUsage: { usagePercent: 18, resetInSec: 180 },
      weeklyUsage: { usagePercent: 58, resetInSec: 580 },
    }),
  }));

  assert.equal(usage.rollingUsage.usedPercent, 18);
  assert.equal(usage.rollingUsage.resetInSeconds, 180);
  assert.equal(usage.weeklyUsage.usedPercent, 58);
  assert.equal(usage.weeklyUsage.resetInSeconds, 580);
});

test('parses OpenCode JS fallback payloads', () => {
  const usage = parseOpenCodeSubscription(`
    window.__usage = {
      rollingUsage: { usagePercent: 27, resetInSec: 3600 },
      weeklyUsage: { usagePercent: 81, resetInSec: 86400 }
    };
  `);

  assert.equal(usage.rollingUsage.usedPercent, 27);
  assert.equal(usage.rollingUsage.resetInSeconds, 3600);
  assert.equal(usage.weeklyUsage.usedPercent, 81);
  assert.equal(usage.weeklyUsage.resetInSeconds, 86400);
});

test('parses OpenCode Go payloads with monthly usage', () => {
  const usage = parseOpenCodeGoSubscription(JSON.stringify({
    rollingUsage: { usagePercent: 11, resetInSec: 111 },
    weeklyUsage: { usagePercent: 22, resetInSec: 222 },
    monthlyUsage: { usagePercent: 33, resetInSec: 333 },
  }));

  assert.equal(usage.rollingUsage.usedPercent, 11);
  assert.equal(usage.weeklyUsage.usedPercent, 22);
  assert.equal(usage.monthlyUsage?.usedPercent, 33);
  assert.equal(usage.monthlyUsage?.resetInSeconds, 333);
});

test('parses OpenCode Go payloads without monthly usage', () => {
  const usage = parseOpenCodeGoSubscription(`
    const data = {
      rollingUsage: { usagePercent: 15, resetInSec: 150 },
      weeklyUsage: { usagePercent: 45, resetInSec: 450 }
    };
  `);

  assert.equal(usage.rollingUsage.usedPercent, 15);
  assert.equal(usage.weeklyUsage.usedPercent, 45);
  assert.equal(usage.monthlyUsage, undefined);
});

test('parses OpenCode Go HTML script payloads with Solid $R wrappers', () => {
  const usage = parseOpenCodeGoSubscription(`
    <script>
      $R[24]($R[18],$R[29]={
        monthlyUsage:null,
        rollingUsage:$R[30]={status:"ok",resetInSec:18000,usagePercent:0},
        weeklyUsage:$R[31]={status:"ok",resetInSec:490010,usagePercent:0},
        monthlyUsage:$R[32]={status:"ok",resetInSec:1316974,usagePercent:6}
      });
    </script>
  `);

  assert.equal(usage.rollingUsage.usedPercent, 0);
  assert.equal(usage.rollingUsage.resetInSeconds, 18000);
  assert.equal(usage.weeklyUsage.usedPercent, 0);
  assert.equal(usage.weeklyUsage.resetInSeconds, 490010);
  assert.equal(usage.monthlyUsage?.usedPercent, 6);
  assert.equal(usage.monthlyUsage?.resetInSeconds, 1316974);
});

test('prefers explicit OpenCode Go usagePercent over status text', () => {
  const usage = parseOpenCodeGoSubscription(`
    <script>
      $R[24]($R[18],$R[25]={
        mine:!0,
        useBalance:!1,
        rollingUsage:$R[26]={status:"ok",resetInSec:16585,usagePercent:1},
        weeklyUsage:$R[27]={status:"ok",resetInSec:401925,usagePercent:31},
        monthlyUsage:$R[28]={status:"ok",resetInSec:1228889,usagePercent:21}
      });
    </script>
  `);

  assert.equal(usage.rollingUsage.usedPercent, 1);
  assert.equal(usage.rollingUsage.resetInSeconds, 16585);
  assert.equal(usage.weeklyUsage.usedPercent, 31);
  assert.equal(usage.monthlyUsage?.usedPercent, 21);
});
