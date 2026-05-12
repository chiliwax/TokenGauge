import { request } from 'node:https';
import type { Provider, ProviderUsage, UsageSection } from './types.js';

function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseBody);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

interface ManusCreditsResponse {
  totalCredits: number;
  freeCredits: number;
  periodicCredits: number;
  addonCredits: number;
  refreshCredits: number;
  maxRefreshCredits: number;
  proMonthlyCredits: number;
  eventCredits: number;
  nextRefreshTime?: string;
  refreshInterval?: string;
}

function creditCountString(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export class ManusProvider implements Provider {
  readonly id = 'manus';
  readonly displayName: string;

  constructor(private token: string, label?: string) {
    this.displayName = label ?? 'Manus';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsPost(
      'https://api.manus.im/user.v1.UserService/GetAvailableCredits',
      {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        Origin: 'https://manus.im',
        Referer: 'https://manus.im/',
        'Connect-Protocol-Version': '1',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      },
      '{}',
    );

    let parsed: ManusCreditsResponse;
    try {
      parsed = JSON.parse(body) as ManusCreditsResponse;
    } catch {
      const envelope: { data?: ManusCreditsResponse; result?: ManusCreditsResponse; response?: ManusCreditsResponse; availableCredits?: ManusCreditsResponse } = JSON.parse(body);
      parsed = envelope.data ?? envelope.result ?? envelope.response ?? envelope.availableCredits ?? ({} as ManusCreditsResponse);
    }

    const expectedKeys = [
      'totalCredits', 'freeCredits', 'periodicCredits', 'addonCredits',
      'refreshCredits', 'maxRefreshCredits', 'proMonthlyCredits', 'eventCredits',
    ];
    const hasAnyKey = expectedKeys.some((k) => k in (parsed as unknown as Record<string, unknown>));
    if (!hasAnyKey) {
      throw new Error('Manus response missing expected credits fields');
    }

    const sections: UsageSection[] = [];

    if (parsed.proMonthlyCredits > 0) {
      const used = parsed.proMonthlyCredits - parsed.periodicCredits;
      sections.push({
        label: 'Monthly',
        usedPercent: Math.min(100, Math.max(0, Math.round((used / parsed.proMonthlyCredits) * 100))),
        current: Math.round(used),
        max: Math.round(parsed.proMonthlyCredits),
      });
    }

    if (parsed.maxRefreshCredits > 0) {
      const used = parsed.maxRefreshCredits - parsed.refreshCredits;
      let resetInSeconds: number | undefined;
      if (parsed.nextRefreshTime) {
        const resetDate = new Date(parsed.nextRefreshTime);
        const diff = Math.floor((resetDate.getTime() - Date.now()) / 1000);
        if (diff > 0) resetInSeconds = diff;
      }
      sections.push({
        label: parsed.refreshInterval ? parsed.refreshInterval.charAt(0).toUpperCase() + parsed.refreshInterval.slice(1) : 'Refresh',
        usedPercent: Math.min(100, Math.max(0, Math.round((used / parsed.maxRefreshCredits) * 100))),
        current: Math.round(used),
        max: Math.round(parsed.maxRefreshCredits),
        resetInSeconds,
      });
    }

    const balance = creditCountString(parsed.totalCredits);
    const free = creditCountString(parsed.freeCredits);

    return {
      providerName: this.displayName,
      plan: `Balance: ${balance} credits · Free: ${free}`,
      sections,
    };
  }
}
