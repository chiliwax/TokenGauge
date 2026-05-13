import type { OAuthAuth } from '../auth.js';
import type { Provider, ProviderUsage, UsageSection } from './types.js';

const CLAUDE_OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const CLAUDE_OAUTH_BETA = 'oauth-2025-04-20';

type AnthropicAuth = OAuthAuth | { type: 'apiKey'; key: string };

interface WindowSpec {
  keys: string[];
  label: string;
}

const WINDOW_SPECS: WindowSpec[] = [
  { keys: ['five_hour'], label: '5h window' },
  { keys: ['seven_day'], label: 'Weekly' },
  { keys: ['seven_day_oauth_apps'], label: 'OAuth apps weekly' },
  { keys: ['seven_day_opus'], label: 'Opus weekly' },
  { keys: ['seven_day_sonnet'], label: 'Sonnet weekly' },
  {
    keys: [
      'seven_day_design',
      'seven_day_claude_design',
      'claude_design',
      'design',
      'seven_day_omelette',
      'omelette',
      'omelette_promotional',
    ],
    label: 'Design weekly',
  },
  {
    keys: [
      'seven_day_routines',
      'seven_day_claude_routines',
      'claude_routines',
      'routines',
      'routine',
      'seven_day_cowork',
      'cowork',
    ],
    label: 'Routines weekly',
  },
  { keys: ['iguana_necktie'], label: 'Iguana Necktie' },
];

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic';
  readonly displayName: string;
  private auth: AnthropicAuth;

  constructor(auth: string | AnthropicAuth, label?: string) {
    this.auth = typeof auth === 'string' ? { type: 'apiKey', key: auth } : auth;
    this.displayName = label ?? 'Claude / Anthropic';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    if (this.auth.type !== 'oauth') {
      return {
        providerName: this.displayName,
        sections: [],
        credits: this.auth.key
          ? 'API key configured — Claude usage requires OpenCode OAuth import'
          : 'API key missing',
      };
    }

    const response = await fetch(CLAUDE_OAUTH_USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.auth.access}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'anthropic-beta': CLAUDE_OAUTH_BETA,
        'User-Agent': 'claude-code/2.1.0',
      },
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Claude OAuth usage HTTP ${response.status}: ${shorten(body)}`);
    }

    const parsed: unknown = JSON.parse(body);
    const data = asRecord(parsed);
    if (!data) {
      return {
        providerName: this.displayName,
        sections: [],
        credits: 'Claude OAuth usage response was empty',
      };
    }

    const sections = usageSections(data);
    const credits = extraUsageCredits(data);

    return {
      providerName: this.displayName,
      sections,
      credits,
    };
  }
}

function usageSections(data: Record<string, unknown>): UsageSection[] {
  const sections: UsageSection[] = [];
  for (const spec of WINDOW_SPECS) {
    const window = firstWindow(data, spec.keys);
    if (!window) continue;
    const utilization = numberValue(window.utilization);
    if (utilization == null) continue;
    sections.push({
      label: spec.label,
      usedPercent: normalizePercent(utilization),
      resetInSeconds: resetInSeconds(window.resets_at),
    });
  }

  const extra = asRecord(data.extra_usage);
  if (extra) {
    const utilization = numberValue(extra.utilization);
    const usedCredits = numberValue(extra.used_credits);
    const monthlyLimit = numberValue(extra.monthly_limit);
    if (utilization != null || usedCredits != null || monthlyLimit != null) {
      sections.push({
        label: 'Extra usage',
        usedPercent: normalizePercent(utilization ?? percentFromUsage(usedCredits, monthlyLimit) ?? 0),
        current: usedCredits,
        max: monthlyLimit,
        remaining: remainingCredits(usedCredits, monthlyLimit),
        displayValue: usageDisplay(usedCredits, monthlyLimit, stringValue(extra.currency)),
      });
    }
  }

  return sections;
}

function firstWindow(data: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = asRecord(data[key]);
    if (value) return value;
  }
  return null;
}

function extraUsageCredits(data: Record<string, unknown>): string | undefined {
  const extra = asRecord(data.extra_usage);
  if (!extra) return undefined;

  const enabled = booleanValue(extra.is_enabled);
  const usedCredits = numberValue(extra.used_credits);
  const monthlyLimit = numberValue(extra.monthly_limit);
  const currency = stringValue(extra.currency);

  if (enabled === false) return 'Extra usage disabled';
  if (usedCredits == null && monthlyLimit == null) return enabled ? 'Extra usage enabled' : undefined;
  return `Extra usage: ${usageDisplay(usedCredits, monthlyLimit, currency)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizePercent(value: number): number {
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

function percentFromUsage(current?: number, max?: number): number | undefined {
  if (current == null || max == null || max <= 0) return undefined;
  return (current / max) * 100;
}

function remainingCredits(current?: number, max?: number): number | undefined {
  if (current == null || max == null) return undefined;
  return Math.max(0, max - current);
}

function usageDisplay(current?: number, max?: number, currency?: string): string | undefined {
  if (current == null && max == null) return undefined;
  const prefix = currencySymbol(currency);
  if (current != null && max != null) return `${prefix}${formatNumber(current)}/${prefix}${formatNumber(max)}`;
  if (current != null) return `${prefix}${formatNumber(current)} used`;
  if (max != null) return `${prefix}${formatNumber(max)} limit`;
  return undefined;
}

function currencySymbol(currency?: string): string {
  if (!currency) return '';
  if (currency.toUpperCase() === 'USD') return '$';
  return `${currency} `;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function resetInSeconds(value: unknown): number | undefined {
  const date = stringValue(value);
  if (!date) return undefined;
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, Math.round((timestamp - Date.now()) / 1000));
}

function shorten(value: string): string {
  const cleaned = redactSecrets(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'empty response';
  return cleaned.length > 400 ? `${cleaned.slice(0, 400)}…` : cleaned;
}

function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-ant-[A-Za-z0-9._-]+/gi, 'sk-ant-[redacted]')
    .replace(/sk-(?!ant-)[A-Za-z0-9._-]+/gi, 'sk-[redacted]')
    .replace(/(access_token|refresh_token|id_token)\s*[:=]\s*(?:\\?["'][^\\"]*\\?["']|[^\s,}]+)/gi, '$1=[redacted]');
}
