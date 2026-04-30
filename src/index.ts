#!/usr/bin/env tsx

import { stdout } from 'node:process';
import { readAuth, readOpenRouterKey } from './auth.js';
import { OpenAiProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenCodeGoProvider } from './providers/opencodego.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { setupScreen, setupInput, cleanupScreen } from './tui/screen.js';
import { buildScreen } from './tui/renderer.js';
import type { Provider, ProviderUsage } from './providers/types.js';

const REFRESH_SECONDS = 30;

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--auth-path' || args[i] === '-p') {
      map.authPath = args[++i] ?? '';
    } else if (args[i] === '--anthropic-key') {
      map.anthropicKey = args[++i] ?? '';
    }
  }
  return map;
}

const cli = parseArgs();
const anthropicKey = cli.anthropicKey || process.env.ANTHROPIC_API_KEY || '';

const providers: Provider[] = [];

try {
  const auth = readAuth(cli.authPath ?? '');
  providers.push(new OpenAiProvider(auth));
} catch {
  // no OpenAI auth available
}

if (anthropicKey) {
  providers.push(new AnthropicProvider(anthropicKey));
}

providers.push(new OpenCodeGoProvider());

const openRouterKey = readOpenRouterKey(cli.authPath ?? '');
if (openRouterKey) {
  providers.push(new OpenRouterProvider(openRouterKey));
}

if (providers.length === 0) {
  process.stderr.write(
    'No providers configured.\n' +
    '  OpenAI: place auth.json at ~/.local/share/opencode/auth.json\n' +
    '  Anthropic: set ANTHROPIC_API_KEY env var or pass --anthropic-key\n',
  );
  process.exit(1);
}

setupScreen();
setupInput(forceRefresh);

let cachedUsages: ProviderUsage[] = [];
let lastFetchTime = 0;
let fetchTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

async function doFetch(): Promise<void> {
  lastFetchTime = Date.now();
  const results = await Promise.allSettled(providers.map((p) => p.fetchUsage()));
  cachedUsages = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      providerName: providers[i].displayName,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      sections: [],
    };
  });
}

function render(): void {
  const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);
  const remaining = Math.max(0, REFRESH_SECONDS - elapsed);
  const screen = buildScreen(cachedUsages, new Date(lastFetchTime), remaining);
  stdout.write(`\x1b[2J\x1b[H${screen}`);
}

async function refreshAndRender(): Promise<void> {
  await doFetch();
  render();
}

function forceRefresh(): void {
  if (fetchTimer) {
    clearTimeout(fetchTimer);
    fetchTimer = null;
  }
  refreshAndRender().then(scheduleFetch);
}

function scheduleFetch(): void {
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = setTimeout(refreshAndRender, REFRESH_SECONDS * 1000);
}

async function main(): Promise<void> {
  await refreshAndRender();
  scheduleFetch();

  tickTimer = setInterval(render, 1000);
  stdout.on('resize', render);

  process.on('SIGINT', () => {
    cleanupScreen();
    stdout.write('\x1b[2J\x1b[H');
    process.exit(0);
  });
}

main().catch((err) => {
  cleanupScreen();
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
