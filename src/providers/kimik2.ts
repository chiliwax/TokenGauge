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

function getNestedValue(obj: unknown, paths: string[][]): number | undefined {
  for (const path of paths) {
    let current: unknown = obj;
    for (const key of path) {
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        current = undefined;
        break;
      }
    }
    if (typeof current === 'number') return current;
  }
  return undefined;
}

const consumedPaths = [
  ['total_credits_consumed'],
  ['totalCreditsConsumed'],
  ['total_credits_used'],
  ['totalCreditsUsed'],
  ['credits_consumed'],
  ['creditsConsumed'],
  ['consumedCredits'],
  ['usedCredits'],
  ['total'],
  ['usage', 'total'],
  ['usage', 'consumed'],
];

const remainingPaths = [
  ['credits_remaining'],
  ['creditsRemaining'],
  ['remaining_credits'],
  ['remainingCredits'],
  ['available_credits'],
  ['availableCredits'],
  ['credits_left'],
  ['creditsLeft'],
  ['usage', 'credits_remaining'],
  ['usage', 'remaining'],
];

export class KimiK2Provider implements Provider {
  readonly id = 'kimik2';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Kimi K2';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://kimi-k2.ai/api/user/credits', {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    });

    const parsed: unknown = JSON.parse(body);
    const consumed = getNestedValue(parsed, consumedPaths) ?? 0;
    const remaining = getNestedValue(parsed, remainingPaths) ?? 0;
    const total = consumed + remaining;

    const usedPct = total > 0 ? Math.min(100, Math.round((consumed / total) * 100)) : 0;

    return {
      providerName: this.displayName,
      plan: `${remaining.toFixed(0)} credits remaining`,
      sections: [
        {
          label: 'Credits',
          usedPercent: usedPct,
          current: Math.round(consumed),
          max: Math.round(total),
        },
      ],
    };
  }
}
