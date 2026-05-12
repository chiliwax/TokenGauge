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

interface ZaiLimit {
  type: string;
  unit: number;
  number: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage: number;
  nextResetTime?: number;
}

interface ZaiQuotaData {
  limits: ZaiLimit[];
  planName?: string;
}

interface ZaiResponse {
  code: number;
  msg: string;
  data?: ZaiQuotaData;
  success: boolean;
}

export class ZaiProvider implements Provider {
  readonly id = 'zai';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'z.ai';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const baseURL = process.env.Z_AI_API_HOST || 'https://api.z.ai';
    const url = `${baseURL}/api/monitor/usage/quota/limit`;

    const body = await httpsGet(url, {
      authorization: `Bearer ${this.apiKey}`,
      accept: 'application/json',
    });

    const parsed: ZaiResponse = JSON.parse(body);

    if (!parsed.success || parsed.code !== 200) {
      throw new Error(`z.ai API error: ${parsed.msg} (code ${parsed.code})`);
    }

    const data = parsed.data;
    if (!data) {
      throw new Error('z.ai API returned empty data');
    }

    const sections: UsageSection[] = [];

    for (const limit of data.limits) {
      const usedPercent = Math.max(0, Math.min(100, limit.percentage));

      let resetInSeconds: number | undefined;
      if (limit.nextResetTime) {
        const resetDate = new Date(limit.nextResetTime);
        const diff = Math.floor((resetDate.getTime() - Date.now()) / 1000);
        if (diff > 0) resetInSeconds = diff;
      }

      let label: string;
      if (limit.type === 'TIME_LIMIT') {
        label = 'Monthly';
      } else if (limit.type === 'TOKENS_LIMIT') {
        const unitMap: Record<number, string> = {
          1: 'day',
          3: 'hour',
          5: 'minute',
          6: 'week',
        };
        const unitLabel = unitMap[limit.unit] || 'window';
        label = limit.number === 1 ? `1 ${unitLabel}` : `${limit.number} ${unitLabel}s`;
      } else {
        label = limit.type;
      }

      sections.push({
        label,
        usedPercent,
        current: limit.usage != null ? Math.round(limit.usage) : undefined,
        max: limit.number > 0 ? Math.round(limit.number) : undefined,
        resetInSeconds,
      });
    }

    return {
      providerName: this.displayName,
      plan: data.planName,
      sections,
    };
  }
}
