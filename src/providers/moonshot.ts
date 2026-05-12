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
  code: number;
  data: {
    available_balance: number;
    voucher_balance: number;
    cash_balance: number;
  };
  scode: string;
  status: boolean;
}

export class MoonshotProvider implements Provider {
  readonly id = 'moonshot';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Moonshot';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://api.moonshot.cn/v1/users/current', {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    });

    const parsed: BalanceResponse = JSON.parse(body);

    if (parsed.code !== 0 || !parsed.status) {
      throw new Error(`Moonshot API error: code ${parsed.code}, scode ${parsed.scode}`);
    }

    const { available_balance, cash_balance, voucher_balance } = parsed.data;
    const balanceStr = `$${available_balance.toFixed(2)}`;

    let detail: string;
    if (cash_balance < 0) {
      detail = `Balance: ${balanceStr} · $${Math.abs(cash_balance).toFixed(2)} in deficit`;
    } else {
      detail = `Balance: ${balanceStr}`;
    }

    return {
      providerName: this.displayName,
      plan: detail,
      sections: [
        {
          label: 'Balance',
          usedPercent: available_balance > 0 ? 0 : 100,
          displayValue: `Cash: $${cash_balance.toFixed(2)} · Voucher: $${voucher_balance.toFixed(2)}`,
        },
      ],
    };
  }
}
