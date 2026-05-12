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

function firstCapture(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  if (match && match[1]) return match[1];
  return undefined;
}

function parsePlanName(html: string): string | undefined {
  const raw = firstCapture(html, /Cloud Usage\s*<\/span>\s*<span[^>]*>([^<]+)<\/span>/i);
  return raw?.trim();
}

function parseAccountEmail(html: string): string | undefined {
  const raw = firstCapture(html, /id="header-email"[^>]*>([^<]+)</i);
  const trimmed = raw?.trim();
  return trimmed?.includes('@') ? trimmed : undefined;
}

function looksSignedOut(html: string): boolean {
  return html.includes('Sign in') || html.includes('Log in') || html.includes('sign_in');
}

function parseUsageBlock(label: string, html: string): { usedPercent: number; resetInSeconds?: number } | undefined {
  const index = html.indexOf(label);
  if (index === -1) return undefined;

  const tail = html.slice(index, index + 1200);

  let usedPercent: number | undefined;
  const usedMatch = tail.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*used/i);
  if (usedMatch) {
    usedPercent = parseFloat(usedMatch[1]);
  } else {
    const widthMatch = tail.match(/width:\s*([0-9]+(?:\.[0-9]+)?)%/i);
    if (widthMatch) usedPercent = parseFloat(widthMatch[1]);
  }

  if (usedPercent == null) return undefined;

  let resetInSeconds: number | undefined;
  const timeMatch = tail.match(/data-time="([^"]+)"/);
  if (timeMatch) {
    const resetDate = new Date(timeMatch[1]);
    if (!isNaN(resetDate.getTime())) {
      const diff = Math.floor((resetDate.getTime() - Date.now()) / 1000);
      if (diff > 0) resetInSeconds = diff;
    }
  }

  return { usedPercent: Math.min(100, Math.max(0, usedPercent)), resetInSeconds };
}

export class OllamaProvider implements Provider {
  readonly id = 'ollama';
  readonly displayName: string;

  constructor(private cookieHeader: string, label?: string) {
    this.displayName = label ?? 'Ollama';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const html = await httpsGet('https://ollama.com/settings', {
      Cookie: this.cookieHeader,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://ollama.com',
      Referer: 'https://ollama.com/settings',
    });

    const plan = parsePlanName(html);
    const email = parseAccountEmail(html);

    const session = parseUsageBlock('Session usage', html) ?? parseUsageBlock('Hourly usage', html);
    const weekly = parseUsageBlock('Weekly usage', html);

    if (!session && !weekly) {
      if (looksSignedOut(html)) {
        throw new Error('Not logged in to Ollama. Please log in via ollama.com/settings.');
      }
      throw new Error('Missing Ollama usage data.');
    }

    const sections: UsageSection[] = [];

    if (session) {
      sections.push({
        label: 'Session',
        usedPercent: session.usedPercent,
        resetInSeconds: session.resetInSeconds,
      });
    }

    if (weekly) {
      sections.push({
        label: 'Weekly',
        usedPercent: weekly.usedPercent,
        resetInSeconds: weekly.resetInSeconds,
      });
    }

    return {
      providerName: this.displayName,
      plan: plan,
      sections,
    };
  }
}
