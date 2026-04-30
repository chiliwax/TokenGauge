import { request } from 'node:https';
import type { Provider, ProviderUsage } from './types.js';
import type { Auth, OAuthAuth, ApiKeyAuth } from '../auth.js';

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

// ── API key response types ────────────────────────────────────────

interface ApiKeyLimit {
  limit_type?: string;
  limit_window?: string;
  max_value?: number;
  current_value?: number;
  remaining_value?: number;
  model_filter?: string | null;
  reset_at?: string;
}

interface ApiKeyResponse {
  request_count?: number;
  total_tokens?: number;
  total_cost_usd?: number;
  limits?: ApiKeyLimit[];
}

// ── Provider ──────────────────────────────────────────────────────

export class OpenAiProvider implements Provider {
  readonly id = 'openai';
  readonly displayName: string;

  constructor(private auth: Auth, label?: string) {
    this.displayName = label ?? 'OpenAI';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    if (this.auth.type === 'oauth') {
      return this.fetchOAuth(this.auth);
    }
    return this.fetchApiKey(this.auth);
  }

  private async fetchOAuth(auth: OAuthAuth): Promise<ProviderUsage> {
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

  private async fetchApiKey(auth: ApiKeyAuth): Promise<ProviderUsage> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.key}`,
    };
    const body = await httpsGet('https://api.openai.com/v1/usage', headers);
    const data: ApiKeyResponse = JSON.parse(body);

    const sections = (data.limits ?? []).map((l) => {
      const label = l.model_filter
        ? `${l.model_filter} (${l.limit_window})`
        : `${l.limit_type ?? 'limit'} (${l.limit_window})`;
      const maxVal = l.max_value ?? 100;
      return {
        label,
        usedPercent: maxVal > 0 ? Math.round(((l.current_value ?? 0) / maxVal) * 100) : 0,
        current: l.current_value,
        max: l.max_value,
        remaining: l.remaining_value,
      };
    });

    return {
      providerName: this.displayName,
      plan: undefined,
      sections,
      credits: data.total_cost_usd != null ? `$${data.total_cost_usd.toFixed(2)}` : undefined,
    };
  }
}
