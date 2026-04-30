import { useState, useEffect } from 'react';
import { loadCredentials } from './config.js';
import type { Auth } from './auth.js';
import { OpenAiProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenCodeGoProvider } from './providers/opencodego.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import type { Provider, ProviderUsage } from './providers/types.js';
import { Dashboard } from './tui/dashboard.js';
import { ManagePage } from './tui/manage.js';

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
      list.push(new OpenCodeGoProvider(entry.label));
    }
  }

  return list;
}

export function App() {
  const [providers, setProviders] = useState(buildProviders);
  const [usages, setUsages] = useState<ProviderUsage[]>([]);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [page, setPage] = useState<'dashboard' | 'manage'>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const doFetch = async () => {
      const now = Date.now();
      const results = await Promise.allSettled(providers.map(p => p.fetchUsage()));
      if (!active) return;
      setUsages(results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return {
          providerName: providers[i].displayName,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          sections: [],
        };
      }));
      setLastFetchTime(now);
    };

    doFetch();
    const timer = setInterval(doFetch, REFRESH_SECONDS * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [providers, refreshKey]);

  if (page === 'manage') {
    return (
      <ManagePage
        onDone={(modified: boolean) => {
          if (modified) {
            setProviders(buildProviders());
          }
          setPage('dashboard');
        }}
      />
    );
  }

  return (
    <Dashboard
      usages={usages}
      lastFetchTime={lastFetchTime}
      refreshSeconds={REFRESH_SECONDS}
      onManage={() => setPage('manage')}
      onRefresh={() => setRefreshKey(k => k + 1)}
    />
  );
}
