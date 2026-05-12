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

interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

export class DeepSeekProvider implements Provider {
  readonly id = 'deepseek';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'DeepSeek';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://api.deepseek.com/user/balance', {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    });

    const parsed: BalanceResponse = JSON.parse(body);

    const balances = parsed.balance_infos.map((b) => ({
      currency: b.currency,
      totalBalance: parseFloat(b.total_balance) || 0,
      grantedBalance: parseFloat(b.granted_balance) || 0,
      toppedUpBalance: parseFloat(b.topped_up_balance) || 0,
    }));

    if (balances.length === 0) {
      return {
        providerName: this.displayName,
        plan: 'No balance data',
        sections: [{ label: 'Balance', usedPercent: 100 }],
      };
    }

    const selected = balances.find((b) => b.currency === 'USD' && b.totalBalance > 0) ?? balances[0];
    const symbol = selected.currency === 'CNY' ? '¥' : '$';
    const total = selected.totalBalance;

    const balanceDetail = `${symbol}${total.toFixed(2)} (Paid: ${symbol}${selected.toppedUpBalance.toFixed(2)} / Granted: ${symbol}${selected.grantedBalance.toFixed(2)})`;

    return {
      providerName: this.displayName,
      plan: balanceDetail,
      sections: [
        {
          label: 'Balance',
          usedPercent: total > 0 ? 0 : 100,
          current: total,
          displayValue: balanceDetail,
        },
      ],
    };
  }
}
