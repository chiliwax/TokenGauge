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

interface ModelRemains {
  model_name?: string;
  current_interval_total_count?: number;
  current_interval_usage_count?: number;
  start_time?: number;
  end_time?: number;
  remains_time?: number;
  current_weekly_total_count?: number;
  current_weekly_usage_count?: number;
  weekly_start_time?: number;
  weekly_end_time?: number;
  weekly_remains_time?: number;
}

interface MiniMaxResponse {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  data?: {
    model_remains?: ModelRemains[];
    base_resp?: {
      status_code?: number;
      status_msg?: string;
    };
  };
}

export class MiniMaxProvider implements Provider {
  readonly id = 'minimax';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'MiniMax';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const regions = ['https://api.minimax.io', 'https://api.minimaxi.com'];
    let lastError: Error | undefined;

    for (const baseURL of regions) {
      try {
        return await this.fetchFromRegion(baseURL);
      } catch (error) {
        if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error('MiniMax API request failed');
  }

  private async fetchFromRegion(baseURL: string): Promise<ProviderUsage> {
    const body = await httpsGet(`${baseURL}/v1/api/openplatform/coding_plan/remains`, {
      Authorization: `Bearer ${this.apiKey}`,
      accept: 'application/json',
      'Content-Type': 'application/json',
      'MM-API-Source': 'tokengauge',
    });

    const parsed: MiniMaxResponse = JSON.parse(body);

    const baseResp = parsed.base_resp ?? parsed.data?.base_resp;
    if (baseResp?.status_code != null && baseResp.status_code !== 0) {
      const msg = baseResp.status_msg ?? `status_code ${baseResp.status_code}`;
      if (baseResp.status_code === 1004 || msg.toLowerCase().includes('cookie') || msg.toLowerCase().includes('login')) {
        throw new Error(`MiniMax invalid credentials: ${msg}`);
      }
      throw new Error(`MiniMax API error: ${msg}`);
    }

    const modelRemains = parsed.data?.model_remains ?? [];
    if (modelRemains.length === 0) {
      throw new Error('MiniMax response missing coding plan data');
    }

    const sections: UsageSection[] = [];

    for (const remains of modelRemains) {
      const modelName = remains.model_name ?? 'Usage';
      const total = remains.current_interval_total_count ?? 0;
      const used = remains.current_interval_usage_count ?? 0;

      if (total > 0) {
        const usedPct = Math.min(100, Math.round((used / total) * 100));
        let resetInSeconds: number | undefined;
        if (remains.end_time) {
          const endDate = new Date(remains.end_time * 1000);
          const diff = Math.floor((endDate.getTime() - Date.now()) / 1000);
          if (diff > 0) resetInSeconds = diff;
        }
        sections.push({
          label: modelName,
          usedPercent: usedPct,
          current: used,
          max: total,
          resetInSeconds,
        });
      }

      const weeklyTotal = remains.current_weekly_total_count ?? 0;
      const weeklyUsed = remains.current_weekly_usage_count ?? 0;
      if (weeklyTotal > 0) {
        const usedPct = Math.min(100, Math.round((weeklyUsed / weeklyTotal) * 100));
        let resetInSeconds: number | undefined;
        if (remains.weekly_end_time) {
          const endDate = new Date(remains.weekly_end_time * 1000);
          const diff = Math.floor((endDate.getTime() - Date.now()) / 1000);
          if (diff > 0) resetInSeconds = diff;
        }
        sections.push({
          label: `${modelName} (weekly)`,
          usedPercent: usedPct,
          current: weeklyUsed,
          max: weeklyTotal,
          resetInSeconds,
        });
      }
    }

    return {
      providerName: this.displayName,
      sections,
    };
  }
}
