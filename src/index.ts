#!/usr/bin/env tsx

import { stdout } from 'node:process';
import { readAuth, readOpenRouterKey } from './auth.js';
import { loadCredentials, saveAccount } from './config.js';
import type { AccountEntry } from './config.js';
import type { Auth } from './auth.js';
import { OpenAiProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenCodeGoProvider } from './providers/opencodego.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { setupScreen, setupInput, cleanupScreen } from './tui/screen.js';
import { runConnectMenu } from './tui/connect.js';
import { buildScreen } from './tui/renderer.js';
import type { Provider, ProviderUsage } from './providers/types.js';

const REFRESH_SECONDS = 30;

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--auth-path' || args[i] === '-p') {
      map.authPath = args[++i] ?? '';
    }
  }
  return map;
}

const cli = parseArgs();

function buildProviders(): Provider[] {
  const list: Provider[] = [];
  const creds = loadCredentials();

  const credOpenAi = creds.filter((a) => a.provider === 'openai');
  const credOpenRouter = creds.filter((a) => a.provider === 'openrouter');
  const credAnthropic = creds.filter((a) => a.provider === 'anthropic');
  const hasOpenAi = credOpenAi.length > 0;
  const hasOpenRouter = credOpenRouter.length > 0;

  if (!hasOpenAi) {
    try {
      const auth = readAuth(cli.authPath ?? '');
      list.push(new OpenAiProvider(auth));
    } catch {
      // no OpenAI auth
    }
  }

  if (!hasOpenRouter) {
    const orKey = readOpenRouterKey(cli.authPath ?? '');
    if (orKey) {
      list.push(new OpenRouterProvider(orKey));
    }
  }

  for (const entry of credOpenAi) {
    const auth: Auth = entry.type === 'oauth'
      ? { type: 'oauth', access: entry.key, accountId: entry.accountId }
      : { type: 'apiKey', key: entry.key };
    list.push(new OpenAiProvider(auth, entry.label));
  }
  for (const entry of credOpenRouter) {
    list.push(new OpenRouterProvider(entry.key, entry.label));
  }
  for (const entry of credAnthropic) {
    list.push(new AnthropicProvider(entry.key, entry.label));
  }

  list.push(new OpenCodeGoProvider());
  return list;
}

let providers = buildProviders();

if (providers.filter((p) => p.id !== 'opencode-go').length === 0) {
  process.stderr.write(
    'No providers configured.\n' +
    '  Press [c] inside the app to connect a provider.\n' +
    '  Or place auth.json at ~/.local/share/opencode/auth.json\n',
  );
  process.exit(1);
}

let cachedUsages: ProviderUsage[] = [];
let lastFetchTime = 0;
let fetchTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let removeInput: (() => void) | null = null;

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
  stdout.write(`\x1b[H${screen}\x1b[J`);
}

async function doRefresh(): Promise<void> {
  await doFetch();
  render();
}

function scheduleFetch(): void {
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = setTimeout(doRefresh, REFRESH_SECONDS * 1000);
}

async function handleConnect(): Promise<void> {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
  if (removeInput) removeInput();

  const result = await runConnectMenu();

  if (result) {
    saveAccount(result);
    providers = buildProviders();
    await doRefresh();
  }

  removeInput = setupInput(forceRefresh, handleConnect);
  scheduleFetch();
  tickTimer = setInterval(render, 1000);
}

function forceRefresh(): void {
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
  doRefresh().then(scheduleFetch);
}

async function main(): Promise<void> {
  setupScreen();
  removeInput = setupInput(forceRefresh, handleConnect);
  stdout.on('resize', () => {
    const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);
    const remaining = Math.max(0, REFRESH_SECONDS - elapsed);
    const screen = buildScreen(cachedUsages, new Date(lastFetchTime), remaining);
    stdout.write(`\x1b[2J\x1b[H${screen}`);
  });

  await doRefresh();
  scheduleFetch();
  tickTimer = setInterval(render, 1000);

  process.on('SIGINT', () => {
    cleanupScreen();
    process.exit(0);
  });
}

main().catch((err) => {
  cleanupScreen();
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
