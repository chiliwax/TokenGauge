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

const labelKeys = ['name', 'label', 'type', 'period', 'scope', 'title', 'id'];
const percentUsedKeys = ['percentUsed', 'usedPercent', 'usagePercent', 'usage_percent', 'used_percent', 'percent_used', 'percent'];
const percentRemainingKeys = ['percentRemaining', 'remainingPercent', 'remaining_percent', 'percent_remaining'];
const limitKeys = ['limit', 'messageLimit', 'message_limit', 'messages', 'maxRequests', 'max_requests', 'requestLimit', 'request_limit', 'quota', 'max', 'total', 'capacity', 'allowance'];
const usedKeys = ['used', 'usage', 'usedMessages', 'used_messages', 'messagesUsed', 'requestsUsed', 'requests_used', 'consumed', 'count'];
const remainingKeys = ['remaining', 'remainingMessages', 'remaining_messages', 'messagesRemaining', 'messages_remaining', 'requestsRemaining', 'requests_remaining', 'left', 'available'];
const resetKeys = ['resetAt', 'reset_at', 'resetsAt', 'resets_at', 'nextReset', 'next_reset', 'nextResetTime', 'next_reset_time', 'refreshAt', 'refresh_at', 'expiresAt', 'expires_at', 'expiration'];

function parseQuota(payload: Record<string, unknown>): UsageSection | undefined {
  const label = getString(payload, labelKeys);

  let usedPercent = getNumber(payload, percentUsedKeys);
  if (usedPercent == null) {
    const remaining = getNumber(payload, percentRemainingKeys);
    if (remaining != null) usedPercent = 100 - remaining;
  }

  if (usedPercent == null) {
    let limit = getNumber(payload, limitKeys);
    let used = getNumber(payload, usedKeys);
    let remaining = getNumber(payload, remainingKeys);

    if (limit == null && used != null && remaining != null) {
      limit = used + remaining;
    }
    if (used == null && limit != null && remaining != null) {
      used = limit - remaining;
    }
    if (remaining == null && limit != null && used != null) {
      remaining = Math.max(0, limit - used);
    }

    if (limit != null && used != null && limit > 0) {
      usedPercent = (used / limit) * 100;
    }
  }

  if (usedPercent == null) return undefined;
  const clamped = Math.max(0, Math.min(usedPercent, 100));

  const resetsAt = getDate(payload, resetKeys);
  let resetInSeconds: number | undefined;
  if (resetsAt) {
    const diff = Math.floor((resetsAt.getTime() - Date.now()) / 1000);
    if (diff > 0) resetInSeconds = diff;
  }

  const limit = getNumber(payload, limitKeys);
  const used = getNumber(payload, usedKeys);

  return {
    label: label ?? 'Usage',
    usedPercent: clamped,
    current: used != null ? Math.round(used) : undefined,
    max: limit != null ? Math.round(limit) : undefined,
    resetInSeconds,
  };
}

function isQuotaPayload(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  const quotaKeys = [...limitKeys, ...usedKeys, ...remainingKeys, ...percentUsedKeys, ...percentRemainingKeys];
  return keys.some((k) => quotaKeys.includes(k));
}

function extractQuotas(obj: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(obj)) {
    return obj.flatMap((item) => extractQuotas(item));
  }
  if (obj && typeof obj === 'object') {
    const dict = obj as Record<string, unknown>;
    if (isQuotaPayload(dict)) return [dict];
    return Object.values(dict).flatMap((v) => extractQuotas(v));
  }
  return [];
}

export class SyntheticProvider implements Provider {
  readonly id = 'synthetic';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Synthetic';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const body = await httpsGet('https://api.synthetic.new/v2/quotas', {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    });

    const parsed: unknown = JSON.parse(body);

    let root: Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed as Record<string, unknown>;
    } else if (Array.isArray(parsed)) {
      root = { quotas: parsed };
    } else {
      root = {};
    }

    const dataDict = root.data as Record<string, unknown> | undefined;
    let quotaObjects: Array<Record<string, unknown>> = [];

    const rolling =
      root.rollingFiveHourLimit ?? dataDict?.rollingFiveHourLimit ??
      root.rolling ?? dataDict?.rolling;
    const weekly = root.weeklyTokenLimit ?? dataDict?.weeklyTokenLimit ?? root.weekly ?? dataDict?.weekly;
    const search = root.search ?? dataDict?.search;
    const searchHourly = search && typeof search === 'object' ? (search as Record<string, unknown>).hourly : undefined;

    const slots = [rolling, weekly, searchHourly];
    for (const slot of slots) {
      if (slot && typeof slot === 'object') {
        if (isQuotaPayload(slot)) {
          quotaObjects.push(slot as Record<string, unknown>);
        } else {
          quotaObjects.push(...extractQuotas(slot));
        }
      }
    }

    if (quotaObjects.length === 0) {
      quotaObjects = extractQuotas(root);
    }

    const sections: UsageSection[] = [];
    const seenLabels = new Set<string>();

    for (const obj of quotaObjects) {
      const section = parseQuota(obj);
      if (section) {
        const key = section.label;
        if (!seenLabels.has(key)) {
          seenLabels.add(key);
          sections.push(section);
        }
      }
    }

    const planName =
      getString(root, ['plan', 'planName', 'plan_name', 'subscription', 'subscriptionPlan', 'tier', 'package', 'packageName']) ??
      getString(dataDict ?? {}, ['plan', 'planName', 'plan_name', 'subscription', 'subscriptionPlan', 'tier', 'package', 'packageName']);

    return {
      providerName: this.displayName,
      plan: planName,
      sections,
    };
  }
}
