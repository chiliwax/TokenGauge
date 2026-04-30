import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import type { Provider, ProviderUsage } from './types.js';

const DB_PATH = `${homedir()}/.local/share/opencode/opencode.db`;

function query(sql: string): string {
  try {
    return execSync(`sqlite3 "${DB_PATH}" "${sql}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export class OpenCodeGoProvider implements Provider {
  readonly id = 'opencode-go';
  readonly displayName = 'OpenCode Go';

  async fetchUsage(): Promise<ProviderUsage> {
    const raw = query(`
      SELECT
        COUNT(*) as msgs,
        ROUND(SUM(COALESCE(json_extract(m.data, '$.cost'), 0)), 4) as cost,
        SUM(COALESCE(json_extract(m.data, '$.tokens.input'), 0)) as inp,
        SUM(COALESCE(json_extract(m.data, '$.tokens.output'), 0)) as out,
        SUM(COALESCE(json_extract(m.data, '$.tokens.cache.read'), 0)) as cache_r
      FROM message m
      WHERE json_extract(m.data, '$.providerID') = 'opencode-go'
        AND json_extract(m.data, '$.cost') IS NOT NULL
        AND m.time_created > (strftime('%s','now') - 2592000) * 1000
    `);

    if (!raw.trim()) {
      return {
        providerName: 'OpenCode Go',
        sections: [],
        credits: 'No usage in last 30 days',
      };
    }

    const cols = raw.trim().split('|');
    const msgs = Number(cols[0] ?? 0);
    const cost = Number(cols[1] ?? 0);
    const inp = Number(cols[2] ?? 0);
    const out = Number(cols[3] ?? 0);
    const cache = Number(cols[4] ?? 0);

    return {
      providerName: 'OpenCode Go',
      plan: 'Last 30 days',
      sections: [
        { label: 'Cost', usedPercent: 0, displayValue: `$${cost.toFixed(2)}` },
        { label: 'Messages', usedPercent: 0, displayValue: String(msgs) },
        { label: 'Input', usedPercent: 0, displayValue: fmt(inp) },
        { label: 'Output', usedPercent: 0, displayValue: fmt(out) },
        { label: 'Cache Read', usedPercent: 0, displayValue: fmt(cache) },
      ],
    };
  }
}
