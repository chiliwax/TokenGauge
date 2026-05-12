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

interface BalanceResponse {
  can_consume: boolean;
  consumption_currency?: string;
  balances: {
    diem?: number;
    usd?: number;
  };
  diem_epoch_allocation?: number;
}

export class VeniceProvider implements Provider {
  readonly id = 'venice';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Venice';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://api.venice.ai/api/v1/billing/balance', {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    });

    const parsed: BalanceResponse = JSON.parse(body);

    const currency = (parsed.consumption_currency ?? 'USD').toUpperCase();
    const balance = currency === 'DIEM' ? (parsed.balances.diem ?? 0) : (parsed.balances.usd ?? 0);
    const allocation = parsed.diem_epoch_allocation ?? 0;

    let detail: string;
    let usedPercent = 0;

    if (!parsed.can_consume) {
      detail = 'Balance unavailable for API calls';
      usedPercent = 100;
    } else if (balance <= 0) {
      detail = `${currency}: 0.00 — add credits`;
      usedPercent = 100;
    } else {
      detail = `${currency}: ${balance.toFixed(2)}`;
      if (allocation > 0) {
        detail += ` · Epoch allocation: ${allocation.toFixed(2)}`;
      }
      usedPercent = 0;
    }

    return {
      providerName: this.displayName,
      plan: detail,
      sections: [
        {
          label: 'Balance',
          usedPercent,
          displayValue: detail,
        },
      ],
    };
  }
}
