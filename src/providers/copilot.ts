import { request } from 'node:https';
import type { Provider, ProviderUsage } from './types.js';

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

interface QuotaSnapshot {
  entitlement: number;
  remaining: number;
  percent_remaining: number;
  quota_id: string;
}

interface CopilotUsageResponse {
  quota_snapshots: {
    premium_interactions?: QuotaSnapshot;
    chat?: QuotaSnapshot;
  };
  copilot_plan: string;
}

export class CopilotProvider implements Provider {
  readonly id = 'copilot';
  readonly displayName: string;

  constructor(private token: string, label?: string) {
    this.displayName = label ?? 'Copilot';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://api.github.com/copilot_internal/user', {
      Authorization: `token ${this.token}`,
      Accept: 'application/json',
      'Editor-Version': 'vscode/1.96.2',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
      'X-Github-Api-Version': '2025-04-01',
    });

    const parsed: CopilotUsageResponse = JSON.parse(body);

    const premium = parsed.quota_snapshots?.premium_interactions;
    const chat = parsed.quota_snapshots?.chat;

    const sections = [];

    if (premium && (premium.entitlement > 0 || premium.remaining > 0 || premium.percent_remaining > 0)) {
      const usedPercent = Math.min(100, Math.max(0, 100 - premium.percent_remaining));
      sections.push({
        label: 'Premium',
        usedPercent,
        current: Math.round(premium.entitlement - premium.remaining),
        max: Math.round(premium.entitlement),
      });
    }

    if (chat && (chat.entitlement > 0 || chat.remaining > 0 || chat.percent_remaining > 0)) {
      const usedPercent = Math.min(100, Math.max(0, 100 - chat.percent_remaining));
      sections.push({
        label: 'Chat',
        usedPercent,
        current: Math.round(chat.entitlement - chat.remaining),
        max: Math.round(chat.entitlement),
      });
    }

    return {
      providerName: this.displayName,
      plan: parsed.copilot_plan ? parsed.copilot_plan.charAt(0).toUpperCase() + parsed.copilot_plan.slice(1) : undefined,
      sections,
    };
  }
}
