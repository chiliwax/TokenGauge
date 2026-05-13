import { chmodSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

export interface AccountEntry {
  provider: 'chatgpt' | 'openai' | 'openrouter' | 'anthropic' | 'opencode' | 'opencode-go' | 'deepseek' | 'venice' | 'moonshot' | 'crof' | 'warp' | 'copilot' | 'synthetic' | 'codebuff' | 'zai' | 'perplexity' | 'manus' | 'doubao' | 'kilo' | 'minimax' | 'ollama';
  key: string;
  type?: string;
  accountId?: string;
  refresh?: string;
  expires?: number;
  label?: string;
  workspaceId?: string;
  age?: string;
}

interface ConfigFile {
  accounts: AccountEntry[];
}

const CONFIG_DIR = `${homedir()}/.config/tokengauge`;
const CONFIG_PATH = `${CONFIG_DIR}/credentials.json`;

export function loadCredentials(): AccountEntry[] {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed: ConfigFile = JSON.parse(raw);
    return parsed.accounts ?? [];
  } catch {
    return [];
  }
}

export function saveAccount(entry: AccountEntry): void {
  const accounts = loadCredentials();
  accounts.push(entry);
  saveCredentials(accounts);
}

export function deleteAccount(index: number): void {
  const accounts = loadCredentials();
  if (index >= 0 && index < accounts.length) {
    accounts.splice(index, 1);
    saveCredentials(accounts);
  }
}

export function updateAccount(index: number, updates: Partial<AccountEntry>): void {
  const accounts = loadCredentials();
  if (index >= 0 && index < accounts.length) {
    Object.assign(accounts[index], updates);
    saveCredentials(accounts);
  }
}

export function detectFromOpenCode(customPath?: string): AccountEntry[] {
  const path = customPath || `${homedir()}/.local/share/opencode/auth.json`;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = asRecord(JSON.parse(raw));
    if (!parsed) return [];
    const accounts: AccountEntry[] = [];
    const o = asRecord(parsed.openai);
    if (o?.type === 'oauth' && typeof o.access === 'string') {
      accounts.push({
        provider: 'chatgpt',
        key: o.access,
        type: 'oauth',
        ...(typeof o.accountId === 'string' ? { accountId: o.accountId } : {}),
        ...(typeof o.refresh === 'string' ? { refresh: o.refresh } : {}),
        ...(typeof o.expires === 'number' ? { expires: o.expires } : {}),
      });
    } else if ((o?.type === 'api' || o?.type === 'apiKey') && typeof o.key === 'string') {
      accounts.push({ provider: 'openai', key: o.key });
    }
    const or = asRecord(parsed.openrouter);
    if (or?.type === 'api' && typeof or.key === 'string') {
      accounts.push({ provider: 'openrouter', key: or.key });
    }
    const a = asRecord(parsed.anthropic);
    if (a?.type === 'oauth' && typeof a.access === 'string') {
      accounts.push({
        provider: 'anthropic',
        key: a.access,
        type: 'oauth',
        ...(typeof a.accountId === 'string' ? { accountId: a.accountId } : {}),
        ...(typeof a.expires === 'number' ? { expires: a.expires } : {}),
      });
    }
    return accounts;
  } catch {
    return [];
  }
}

export function fmtAge(entry: AccountEntry): string {
  const knownAge = entry.age;
  if (knownAge) return knownAge;
  return '';
}

function saveCredentials(accounts: AccountEntry[]): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify({ accounts }, null, 2) + '\n', { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
