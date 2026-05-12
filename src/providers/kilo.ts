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

function getValue(obj: unknown, keys: string[]): unknown {
  for (const key of keys) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      obj = (obj as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return obj;
}

function getNumber(obj: unknown, keys: string[]): number | undefined {
  const value = getValue(obj, keys);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return undefined;
}

function getString(obj: unknown, keys: string[]): string | undefined {
  const value = getValue(obj, keys);
  if (typeof value === 'string') return value;
  return undefined;
}

function getDate(obj: unknown, keys: string[]): Date | undefined {
  const value = getValue(obj, keys);
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

function parseKiloResponse(data: unknown): {
  creditsUsed?: number;
  creditsTotal?: number;
  creditsRemaining?: number;
  passUsed?: number;
  passTotal?: number;
  passRemaining?: number;
  passBonus?: number;
  passResetsAt?: Date;
  planName?: string;
  autoTopUpEnabled?: boolean;
} {
  const result: ReturnType<typeof parseKiloResponse> = {};

  if (!Array.isArray(data)) return result;

  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    if (e.error) continue;
    const resultObj = e.result && typeof e.result === 'object' ? e.result as Record<string, unknown> : undefined;
    const dataObj = resultObj?.data && typeof resultObj.data === 'object' ? resultObj.data as Record<string, unknown> : undefined;
    const payload = dataObj?.json ?? resultObj;
    if (!payload || typeof payload !== 'object') continue;
    const p = payload as Record<string, unknown>;

    const creditBlocks = p.creditBlocks ?? p.credits;
    if (creditBlocks && typeof creditBlocks === 'object') {
      const cb = creditBlocks as Record<string, unknown>;
      result.creditsUsed = getNumber(cb, ['used']) ?? getNumber(cb, ['currentPeriodUsageUsd']);
      result.creditsTotal = getNumber(cb, ['total']) ?? getNumber(cb, ['currentPeriodBaseCreditsUsd']);
      result.creditsRemaining = getNumber(cb, ['remaining']);
    }

    const pass = p.pass ?? p.subscription ?? p.kiloPass;
    if (pass && typeof pass === 'object') {
      const ps = pass as Record<string, unknown>;
      result.passUsed = getNumber(ps, ['used']) ?? getNumber(ps, ['currentPeriodUsageUsd']);
      const baseCredits = getNumber(ps, ['currentPeriodBaseCreditsUsd']);
      const bonusCredits = getNumber(ps, ['currentPeriodBonusCreditsUsd']) ?? 0;
      result.passBonus = bonusCredits > 0 ? bonusCredits : undefined;
      result.passTotal = baseCredits != null ? baseCredits + bonusCredits : getNumber(ps, ['total']);
      result.passRemaining = getNumber(ps, ['remaining']);
      result.passResetsAt = getDate(ps, ['nextBillingAt']) ?? getDate(ps, ['nextRenewalAt']) ?? getDate(ps, ['renewsAt']) ?? getDate(ps, ['renewAt']);
      result.planName = getString(ps, ['planName']) ?? getString(ps, ['name']);
    }

    if (p.autoTopUpEnabled != null) {
      result.autoTopUpEnabled = Boolean(p.autoTopUpEnabled);
    }
  }

  return result;
}

export class KiloProvider implements Provider {
  readonly id = 'kilo';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Kilo';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const procedures = ['user.getCreditBlocks', 'kiloPass.getState', 'user.getAutoTopUpPaymentMethod'];
    const joined = procedures.join(',');
    const inputMap: Record<string, { json: Record<string, unknown> }> = {};
    for (let i = 0; i < procedures.length; i++) {
      inputMap[String(i)] = { json: {} };
    }

    const url = `https://app.kilo.ai/api/trpc/${joined}?batch=1&input=${encodeURIComponent(JSON.stringify(inputMap))}`;

    const body = await httpsGet(url, {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    });

    const parsed: unknown = JSON.parse(body);
    const data = parseKiloResponse(parsed);

    const sections: UsageSection[] = [];

    const total = data.creditsTotal ?? (data.creditsUsed != null && data.creditsRemaining != null ? data.creditsUsed + data.creditsRemaining : undefined);
    if (total != null && total > 0) {
      const used = data.creditsUsed ?? total - (data.creditsRemaining ?? 0);
      sections.push({
        label: 'Credits',
        usedPercent: Math.min(100, Math.round((used / total) * 100)),
        current: Math.round(used * 100) / 100,
        max: Math.round(total * 100) / 100,
      });
    }

    const passTotal = data.passTotal ?? (data.passUsed != null && data.passRemaining != null ? data.passUsed + data.passRemaining : undefined);
    if (passTotal != null && passTotal > 0) {
      const used = data.passUsed ?? passTotal - (data.passRemaining ?? 0);
      let resetInSeconds: number | undefined;
      if (data.passResetsAt) {
        const diff = Math.floor((data.passResetsAt.getTime() - Date.now()) / 1000);
        if (diff > 0) resetInSeconds = diff;
      }
      sections.push({
        label: 'Pass',
        usedPercent: Math.min(100, Math.round((used / passTotal) * 100)),
        current: Math.round(used * 100) / 100,
        max: Math.round(passTotal * 100) / 100,
        resetInSeconds,
      });
    }

    let plan = data.planName;
    if (data.autoTopUpEnabled) {
      plan = plan ? `${plan} · Auto top-up` : 'Auto top-up';
    }

    return {
      providerName: this.displayName,
      plan,
      sections,
    };
  }
}
