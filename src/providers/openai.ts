import { request } from 'node:https';
import type { Provider, ProviderUsage } from './types.js';
import type { OAuthAuth } from '../auth.js';
import { refreshChatGptAccessToken } from '../openai-oauth.js';

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── OAuth response types ─────────────────────────────────────────

interface OAuthResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: { used_percent?: number; reset_after_seconds?: number };
    secondary_window?: { used_percent?: number; reset_after_seconds?: number };
    spark_primary_window?: { used_percent?: number; limit_window_seconds?: number; reset_after_seconds?: number };
    spark_secondary_window?: { used_percent?: number; limit_window_seconds?: number; reset_after_seconds?: number };
  };
  additional_rate_limits?: Array<{
    limit_name?: string;
    metered_feature?: string;
    rate_limit?: {
      primary_window?: { used_percent?: number; reset_after_seconds?: number };
      secondary_window?: { used_percent?: number; reset_after_seconds?: number };
    };
  }>;
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: string;
  };
}

export class ChatGptProvider implements Provider {
  readonly id = 'chatgpt';
  readonly displayName: string;

  constructor(
    private auth: OAuthAuth,
    label?: string,
    private onRefresh?: (auth: OAuthAuth) => void,
  ) {
    this.displayName = label ?? 'ChatGPT Plus/Pro';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const auth = await this.currentAuth();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.access}`,
    };
    if (auth.accountId) {
      headers['ChatGPT-Account-Id'] = auth.accountId;
    }
    const body = await httpsGet('https://chatgpt.com/backend-api/wham/usage', headers);
    const data: OAuthResponse = JSON.parse(body);

    const sections = [];
    const rl = data.rate_limit;

    if (rl) {
      if (rl.primary_window && rl.primary_window.used_percent != null) {
        sections.push({
          label: '5h window',
          usedPercent: rl.primary_window.used_percent,
          resetInSeconds: rl.primary_window.reset_after_seconds,
        });
      }

      if (rl.secondary_window && rl.secondary_window.used_percent != null) {
        sections.push({
          label: 'Weekly',
          usedPercent: rl.secondary_window.used_percent,
          resetInSeconds: rl.secondary_window.reset_after_seconds,
        });
      }

      if (rl.spark_primary_window && rl.spark_primary_window.used_percent != null) {
        sections.push({
          label: 'Spark (5h)',
          usedPercent: rl.spark_primary_window.used_percent,
          resetInSeconds: rl.spark_primary_window.reset_after_seconds,
        });
      }
    }

    if (data.additional_rate_limits) {
      for (const al of data.additional_rate_limits) {
        const p = al.rate_limit?.primary_window;
        if (p && p.used_percent != null) {
          sections.push({
            label: al.limit_name ?? al.metered_feature ?? 'Unknown',
            usedPercent: p.used_percent,
            resetInSeconds: p.reset_after_seconds,
          });
        }
      }
    }

    let credits: string | undefined;
    const c = data.credits;
    if (c) {
      credits = c.has_credits ? (c.unlimited ? 'Unlimited' : `$${c.balance}`) : 'None';
    }

    return {
      providerName: this.displayName,
      plan: data.plan_type,
      sections,
      credits,
    };
  }

  private async currentAuth(): Promise<OAuthAuth> {
    if (!this.auth.refresh || !this.auth.expires || this.auth.expires > Date.now() + 60_000) {
      return this.auth;
    }

    const refreshed = await refreshChatGptAccessToken(this.auth.refresh);
    this.auth = {
      type: 'oauth',
      access: refreshed.key,
      accountId: refreshed.accountId ?? this.auth.accountId,
      refresh: refreshed.refresh ?? this.auth.refresh,
      expires: refreshed.expires,
    };
    this.onRefresh?.(this.auth);
    return this.auth;
  }
}

export class OpenAiProvider implements Provider {
  readonly id = 'openai';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'OpenAI API';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    return {
      providerName: this.displayName,
      sections: [],
      credits: this.apiKey
        ? 'API key configured — OpenAI API usage requires an organization/admin usage endpoint'
        : 'API key missing',
    };
  }
}
