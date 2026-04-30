import { request } from 'node:https';
import type { Provider, ProviderUsage } from './types.js';

interface CreditsData {
  total_credits: number;
  total_usage: number;
}

interface CreditsResponse {
  data: CreditsData;
}

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

export class OpenRouterProvider implements Provider {
  readonly id = 'openrouter';
  readonly displayName = 'OpenRouter';

  constructor(private apiKey: string) {}

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://openrouter.ai/api/v1/credits', {
      Authorization: `Bearer ${this.apiKey}`,
    });

    const { data }: CreditsResponse = JSON.parse(body);

    const total = data.total_credits;
    const used = data.total_usage;
    const remaining = total - used;
    const usedPct = Math.min(100, Math.round((used / total) * 100));

    return {
      providerName: 'OpenRouter',
      plan: `$${remaining.toFixed(2)} remaining`,
      sections: [
        {
          label: 'Used',
          usedPercent: usedPct,
          current: Math.round(used * 100) / 100,
          max: Math.round(total * 100) / 100,
        },
      ],
    };
  }
}
