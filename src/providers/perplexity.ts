import { request } from 'node:https';
import type { Provider, ProviderUsage, UsageSection } from './types.js';

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

interface PerplexityCreditGrant {
  type: string;
  amount_cents: number;
  expires_at_ts?: number;
}

interface PerplexityCreditsResponse {
  balance_cents: number;
  renewal_date_ts: number;
  current_period_purchased_cents: number;
  credit_grants: PerplexityCreditGrant[];
  total_usage_cents: number;
}

export class PerplexityProvider implements Provider {
  readonly id = 'perplexity';
  readonly displayName: string;

  constructor(private cookieHeader: string, label?: string) {
    this.displayName = label ?? 'Perplexity';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet(
      'https://www.perplexity.ai/rest/billing/credits?version=2.18&source=default',
      {
        Accept: 'application/json',
        Cookie: this.cookieHeader,
        Origin: 'https://www.perplexity.ai',
        Referer: 'https://www.perplexity.ai/account/usage',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      },
    );

    const parsed: PerplexityCreditsResponse = JSON.parse(body);
    const now = Date.now() / 1000;

    const recurring = parsed.credit_grants.filter((g) => g.type === 'recurring');
    const promotional = parsed.credit_grants.filter(
      (g) => g.type === 'promotional' && (g.expires_at_ts ?? Infinity) > now,
    );
    const purchased = parsed.credit_grants.filter((g) => g.type === 'purchased');

    const recurringSum = Math.max(0, recurring.reduce((sum, g) => sum + g.amount_cents, 0));
    const promoSum = Math.max(0, promotional.reduce((sum, g) => sum + g.amount_cents, 0));
    const purchasedFromGrants = Math.max(0, purchased.reduce((sum, g) => sum + g.amount_cents, 0));
    const purchasedFromField = Math.max(0, parsed.current_period_purchased_cents);
    const purchasedSum = Math.max(purchasedFromGrants, purchasedFromField);

    let remaining = parsed.total_usage_cents;
    const usedFromRecurring = Math.min(remaining, recurringSum);
    remaining -= usedFromRecurring;
    const usedFromPurchased = Math.min(remaining, purchasedSum);
    remaining -= usedFromPurchased;
    const usedFromPromo = Math.min(remaining, promoSum);

    const sections: UsageSection[] = [];

    if (recurringSum > 0) {
      sections.push({
        label: 'Recurring',
        usedPercent: Math.min(100, Math.round((usedFromRecurring / recurringSum) * 100)),
        current: Math.round(usedFromRecurring),
        max: Math.round(recurringSum),
      });
    }

    if (purchasedSum > 0) {
      sections.push({
        label: 'Purchased',
        usedPercent: Math.min(100, Math.round((usedFromPurchased / purchasedSum) * 100)),
        current: Math.round(usedFromPurchased),
        max: Math.round(purchasedSum),
      });
    }

    if (promoSum > 0) {
      sections.push({
        label: 'Promo',
        usedPercent: Math.min(100, Math.round((usedFromPromo / promoSum) * 100)),
        current: Math.round(usedFromPromo),
        max: Math.round(promoSum),
      });
    }

    const renewalDate = new Date(parsed.renewal_date_ts * 1000);
    const plan = `Balance: $${(parsed.balance_cents / 100).toFixed(2)} · Renews ${renewalDate.toLocaleDateString()}`;

    return {
      providerName: this.displayName,
      plan,
      sections,
    };
  }
}
