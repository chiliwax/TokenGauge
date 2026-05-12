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

interface UsageResponse {
  credits: number;
  requests_plan: number;
  usable_requests: number;
}

export class CrofProvider implements Provider {
  readonly id = 'crof';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Crof';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://crof.ai/usage_api/', {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    });

    const parsed: UsageResponse = JSON.parse(body);

    const credits = parsed.credits;
    const plan = parsed.requests_plan;
    const usable = parsed.usable_requests;

    const usedPct = plan > 0 ? Math.min(100, Math.round(((plan - usable) / plan) * 100)) : 0;

    return {
      providerName: this.displayName,
      plan: `${credits.toFixed(2)} credits`,
      sections: [
        {
          label: 'Requests',
          usedPercent: usedPct,
          current: Math.round(plan - usable),
          max: Math.round(plan),
        },
      ],
    };
  }
}
