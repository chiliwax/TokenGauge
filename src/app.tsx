import { useState, useEffect } from 'react';
import { loadCredentials, updateAccount } from './config.js';
import { ChatGptProvider, OpenAiProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenCodeProvider } from './providers/opencode.js';
import { OpenCodeGoProvider } from './providers/opencodego.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { VeniceProvider } from './providers/venice.js';
import { MoonshotProvider } from './providers/moonshot.js';
import { CrofProvider } from './providers/crof.js';
import { WarpProvider } from './providers/warp.js';
import { CopilotProvider } from './providers/copilot.js';
import { SyntheticProvider } from './providers/synthetic.js';
import { CodebuffProvider } from './providers/codebuff.js';
import { ZaiProvider } from './providers/zai.js';
import { PerplexityProvider } from './providers/perplexity.js';
import { ManusProvider } from './providers/manus.js';
import { DoubaoProvider } from './providers/doubao.js';
import { KiloProvider } from './providers/kilo.js';
import { MiniMaxProvider } from './providers/minimax.js';
import { OllamaProvider } from './providers/ollama.js';
import type { Provider, ProviderUsage } from './providers/types.js';
import { Dashboard } from './tui/dashboard.js';
import { ManagePage } from './tui/manage.js';

const REFRESH_SECONDS = 30;

function buildProviders(): Provider[] {
  const list: Provider[] = [];
  const creds = loadCredentials();

  for (const [index, entry] of creds.entries()) {
    if (entry.provider === 'chatgpt' || (entry.provider === 'openai' && entry.type === 'oauth')) {
      list.push(new ChatGptProvider(
        {
          type: 'oauth',
          access: entry.key,
          accountId: entry.accountId,
          refresh: entry.refresh,
          expires: entry.expires,
        },
        entry.label,
        (auth) => updateAccount(index, {
          key: auth.access,
          accountId: auth.accountId,
          refresh: auth.refresh,
          expires: auth.expires,
        }),
      ));
    } else if (entry.provider === 'openai') {
      list.push(new OpenAiProvider(entry.key, entry.label));
    } else if (entry.provider === 'openrouter') {
      list.push(new OpenRouterProvider(entry.key, entry.label));
    } else if (entry.provider === 'anthropic') {
      if (entry.type === 'oauth') {
        list.push(new AnthropicProvider({
          type: 'oauth',
          access: entry.key,
          accountId: entry.accountId,
          refresh: entry.refresh,
          expires: entry.expires,
        }, entry.label));
      } else {
        list.push(new AnthropicProvider(entry.key, entry.label));
      }
    } else if (entry.provider === 'opencode') {
      list.push(new OpenCodeProvider(
        entry.key,
        entry.workspaceId ?? opencodeWorkspaceEnv(),
        entry.label,
      ));
    } else if (entry.provider === 'opencode-go') {
      list.push(new OpenCodeGoProvider(
        entry.key,
        entry.workspaceId ?? opencodeGoWorkspaceEnv(),
        entry.label,
      ));
    } else if (entry.provider === 'deepseek') {
      list.push(new DeepSeekProvider(entry.key, entry.label));
    } else if (entry.provider === 'venice') {
      list.push(new VeniceProvider(entry.key, entry.label));
    } else if (entry.provider === 'moonshot') {
      list.push(new MoonshotProvider(entry.key, entry.label));
    } else if (entry.provider === 'crof') {
      list.push(new CrofProvider(entry.key, entry.label));
    } else if (entry.provider === 'warp') {
      list.push(new WarpProvider(entry.key, entry.label));
    } else if (entry.provider === 'copilot') {
      list.push(new CopilotProvider(entry.key, entry.label));
    } else if (entry.provider === 'synthetic') {
      list.push(new SyntheticProvider(entry.key, entry.label));
    } else if (entry.provider === 'codebuff') {
      list.push(new CodebuffProvider(entry.key, entry.label));
    } else if (entry.provider === 'zai') {
      list.push(new ZaiProvider(entry.key, entry.label));
    } else if (entry.provider === 'perplexity') {
      list.push(new PerplexityProvider(entry.key, entry.label));
    } else if (entry.provider === 'manus') {
      list.push(new ManusProvider(entry.key, entry.label));
    } else if (entry.provider === 'doubao') {
      list.push(new DoubaoProvider(entry.key, entry.label));
    } else if (entry.provider === 'kilo') {
      list.push(new KiloProvider(entry.key, entry.label));
    } else if (entry.provider === 'minimax') {
      list.push(new MiniMaxProvider(entry.key, entry.label));
    } else if (entry.provider === 'ollama') {
      list.push(new OllamaProvider(entry.key, entry.label));
    }
  }

  if (!creds.some((entry) => entry.provider === 'opencode') && process.env.OPENCODE_COOKIE) {
    list.push(new OpenCodeProvider(
      process.env.OPENCODE_COOKIE,
      opencodeWorkspaceEnv(),
    ));
  }

  const opencodeGoCookie = process.env.OPENCODE_GO_COOKIE ?? process.env.OPENCODE_COOKIE;
  if (!creds.some((entry) => entry.provider === 'opencode-go') && opencodeGoCookie) {
    list.push(new OpenCodeGoProvider(
      opencodeGoCookie,
      opencodeGoWorkspaceEnv(),
    ));
  }

  return list;
}

function opencodeWorkspaceEnv(): string | undefined {
  return process.env.OPENCODE_WORKSPACE_ID
    ?? process.env.CODEXBAR_OPENCODE_WORKSPACE_ID;
}

function opencodeGoWorkspaceEnv(): string | undefined {
  return process.env.OPENCODE_GO_WORKSPACE_ID
    ?? process.env.CODEXBAR_OPENCODEGO_WORKSPACE_ID
    ?? opencodeWorkspaceEnv();
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
