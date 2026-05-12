import { request } from 'node:https';
import type { Provider, ProviderUsage, UsageSection } from './types.js';

function httpsRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
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
    if (body) req.write(body);
    req.end();
  });
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof value === 'number') {
    const ts = value > 1000000000000 ? value : value * 1000;
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

export class CodebuffProvider implements Provider {
  readonly id = 'codebuff';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Codebuff';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const baseURL = process.env.CODEBUFF_API_URL || 'https://www.codebuff.com';

    const usageBody = await httpsRequest(
      `${baseURL}/api/v1/usage`,
      'GET',
      {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    );

    const usageRoot: unknown = JSON.parse(usageBody);
    const usage =
      usageRoot && typeof usageRoot === 'object' && !Array.isArray(usageRoot)
        ? (usageRoot as Record<string, unknown>)
        : {};

    const used =
      typeof usage.usage === 'number'
        ? usage.usage
        : typeof usage.used === 'number'
          ? usage.used
          : undefined;
    const total =
      typeof usage.quota === 'number'
        ? usage.quota
        : typeof usage.limit === 'number'
          ? usage.limit
          : undefined;
    const remaining =
      typeof usage.remainingBalance === 'number'
        ? usage.remainingBalance
        : typeof usage.remaining === 'number'
          ? usage.remaining
          : undefined;
    const nextQuotaReset = parseDate(usage.next_quota_reset);
    const autoTopUp =
      typeof usage.autoTopupEnabled === 'boolean'
        ? usage.autoTopupEnabled
        : typeof usage.auto_topup_enabled === 'boolean'
          ? usage.auto_topup_enabled
          : undefined;

    let subscription: Record<string, unknown> | undefined;
    try {
      const subBody = await httpsRequest(
        `${baseURL}/api/user/subscription`,
        'GET',
        {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
        },
      );
      const subRoot: unknown = JSON.parse(subBody);
      subscription =
        subRoot && typeof subRoot === 'object' && !Array.isArray(subRoot)
          ? (subRoot as Record<string, unknown>)
          : undefined;
    } catch {
      void 0;
    }

    const sub = subscription?.subscription as Record<string, unknown> | undefined;
    const rateLimit = subscription?.rateLimit as Record<string, unknown> | undefined;

    const tier =
      typeof sub?.displayName === 'string'
        ? sub.displayName
        : typeof subscription?.displayName === 'string'
          ? subscription.displayName
          : undefined;
    const status =
      typeof sub?.status === 'string'
        ? sub.status
        : typeof subscription?.status === 'string'
          ? subscription.status
          : undefined;
    const weeklyUsed =
      typeof rateLimit?.weeklyUsed === 'number'
        ? rateLimit.weeklyUsed
        : typeof subscription?.weeklyUsed === 'number'
          ? subscription.weeklyUsed
          : undefined;
    const weeklyLimit =
      typeof rateLimit?.weeklyLimit === 'number'
        ? rateLimit.weeklyLimit
        : typeof subscription?.weeklyLimit === 'number'
          ? subscription.weeklyLimit
          : undefined;
    const weeklyResetsAt = parseDate(rateLimit?.weeklyResetsAt ?? subscription?.weeklyResetsAt);
    const billingPeriodEnd = parseDate(sub?.billingPeriodEnd ?? subscription?.billingPeriodEnd);

    const sections: UsageSection[] = [];

    const resolvedTotal = total ?? (used != null && remaining != null ? used + remaining : undefined);
    if (resolvedTotal != null && resolvedTotal > 0) {
      const resolvedUsed = used ?? resolvedTotal - (remaining ?? 0);
      const usedPct = Math.min(100, Math.round((resolvedUsed / resolvedTotal) * 100));
      let resetInSeconds: number | undefined;
      if (nextQuotaReset) {
        const diff = Math.floor((nextQuotaReset.getTime() - Date.now()) / 1000);
        if (diff > 0) resetInSeconds = diff;
      }
      sections.push({
        label: 'Credits',
        usedPercent: usedPct,
        current: Math.round(resolvedUsed),
        max: Math.round(resolvedTotal),
        resetInSeconds,
      });
    }

    if (weeklyLimit != null && weeklyLimit > 0) {
      const wUsed = weeklyUsed ?? 0;
      const usedPct = Math.min(100, Math.round((wUsed / weeklyLimit) * 100));
      let resetInSeconds: number | undefined;
      if (weeklyResetsAt) {
        const diff = Math.floor((weeklyResetsAt.getTime() - Date.now()) / 1000);
        if (diff > 0) resetInSeconds = diff;
      }
      sections.push({
        label: 'Weekly',
        usedPercent: usedPct,
        current: Math.round(wUsed),
        max: Math.round(weeklyLimit),
        resetInSeconds,
      });
    }

    let plan = tier;
    if (status && status !== 'active') {
      plan = plan ? `${plan} (${status})` : status;
    }
    if (autoTopUp) {
      plan = plan ? `${plan} · Auto-top-up` : 'Auto-top-up';
    }
    if (billingPeriodEnd) {
      const dateStr = billingPeriodEnd.toLocaleDateString();
      plan = plan ? `${plan} · Ends ${dateStr}` : `Ends ${dateStr}`;
    }

    return {
      providerName: this.displayName,
      plan,
      sections,
    };
  }
}
