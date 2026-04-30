#!/usr/bin/env tsx

import { stdout } from 'node:process';
import type { Auth } from './auth.js';
import { readAuth, readOpenRouterKey } from './auth.js';
import { loadCredentials, saveAccount } from './config.js';
import { OpenAiProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenCodeGoProvider } from './providers/opencodego.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { setupScreen, setupInput, cleanupScreen } from './tui/screen.js';
import { runManageMenu } from './tui/manage.js';
import { buildScreen } from './tui/renderer.js';
import type { Provider, ProviderUsage } from './providers/types.js';

const REFRESH_SECONDS = 30;

function buildProviders(): Provider[] {
  const list: Provider[] = [];
  const creds = loadCredentials();

  for (const entry of creds) {
    if (entry.provider === 'openai') {
      const auth: Auth = entry.type === 'oauth'
        ? { type: 'oauth', access: entry.key, accountId: entry.accountId }
        : { type: 'apiKey', key: entry.key };
      list.push(new OpenAiProvider(auth, entry.label));
    } else if (entry.provider === 'openrouter') {
      list.push(new OpenRouterProvider(entry.key, entry.label));
    } else if (entry.provider === 'anthropic') {
      list.push(new AnthropicProvider(entry.key, entry.label));
    } else if (entry.provider === 'opencode-go') {
      list.push(new OpenCodeGoProvider());
    }
  }

  return list;
}

let providers = buildProviders();

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

async function handleManage(): Promise<void> {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
  if (removeInput) removeInput();

  const modified = await runManageMenu();

  if (modified) {
    providers = buildProviders();
  }

  await doRefresh();
  removeInput = setupInput(forceRefresh, handleManage);
  scheduleFetch();
  tickTimer = setInterval(render, 1000);
}

function forceRefresh(): void {
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
  doRefresh().then(scheduleFetch);
}

async function main(): Promise<void> {
  setupScreen();
  removeInput = setupInput(forceRefresh, handleManage);
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
