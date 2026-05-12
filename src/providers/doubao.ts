import { request } from 'node:https';
import type { Provider, ProviderUsage } from './types.js';

function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<{ body: string; headers: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        const responseHeaders: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value != null) responseHeaders[key] = value;
        }
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ body: responseBody, headers: responseHeaders });
        } else if (res.statusCode === 429) {
          resolve({ body: responseBody, headers: responseHeaders });
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

function getHeader(headers: Record<string, string | string[]>, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

const PROBE_MODELS = [
  'doubao-seed-2.0-code',
  'doubao-1.5-pro-32k',
  'doubao-lite-32k',
];

export class DoubaoProvider implements Provider {
  readonly id = 'doubao';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Doubao';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    let lastError: Error | undefined;

    for (const model of PROBE_MODELS) {
      try {
        return await this.probe(model);
      } catch (error) {
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('403'))) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error('All Doubao probe models failed');
  }

  private async probe(model: string): Promise<ProviderUsage> {
    const body = JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const { headers, body: responseBody } = await httpsPost(
      'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions',
      {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    );

    const remaining = parseInt(getHeader(headers, 'x-ratelimit-remaining-requests') ?? '0', 10);
    const limit = parseInt(getHeader(headers, 'x-ratelimit-limit-requests') ?? '0', 10);
    const resetString = getHeader(headers, 'x-ratelimit-reset-requests');

    let resetInSeconds: number | undefined;
    if (resetString) {
      const resetDate = new Date(resetString);
      const diff = Math.floor((resetDate.getTime() - Date.now()) / 1000);
      if (diff > 0) resetInSeconds = diff;
    }

    let totalTokens: number | undefined;
    if (!remaining && !limit) {
      try {
        const parsed = JSON.parse(responseBody);
        totalTokens = parsed.usage?.total_tokens;
      } catch {
        void 0;
      }
    }

    const used = limit > 0 ? Math.max(0, limit - remaining) : 0;
    const usedPct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return {
      providerName: this.displayName,
      plan: limit > 0 ? `${used}/${limit} requests` : 'Active',
      sections: [
        {
          label: 'Requests',
          usedPercent: usedPct,
          current: used,
          max: limit > 0 ? limit : undefined,
          resetInSeconds,
        },
      ],
      credits: totalTokens != null ? `${totalTokens} tokens` : undefined,
    };
  }
}
