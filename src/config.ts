import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ accounts }, null, 2) + '\n');
}

export function deleteAccount(index: number): void {
  const accounts = loadCredentials();
  if (index >= 0 && index < accounts.length) {
    accounts.splice(index, 1);
    writeFileSync(CONFIG_PATH, JSON.stringify({ accounts }, null, 2) + '\n');
  }
}

export function updateAccount(index: number, updates: Partial<AccountEntry>): void {
  const accounts = loadCredentials();
  if (index >= 0 && index < accounts.length) {
    Object.assign(accounts[index], updates);
    writeFileSync(CONFIG_PATH, JSON.stringify({ accounts }, null, 2) + '\n');
  }
}

export function detectFromOpenCode(customPath?: string): AccountEntry[] {
  const path = customPath || `${homedir()}/.local/share/opencode/auth.json`;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    const accounts: AccountEntry[] = [];
    const o = parsed.openai;
    if (o?.type === 'oauth' && o.access) {
      accounts.push({
        provider: 'chatgpt',
        key: o.access,
        type: 'oauth',
        ...(typeof o.accountId === 'string' ? { accountId: o.accountId } : {}),
        ...(typeof o.refresh === 'string' ? { refresh: o.refresh } : {}),
        ...(typeof o.expires === 'number' ? { expires: o.expires } : {}),
      });
    } else if ((o?.type === 'api' || o?.type === 'apiKey') && o.key) {
      accounts.push({ provider: 'openai', key: o.key });
    }
    const or = parsed.openrouter;
    if (or?.type === 'api' && or.key) {
      accounts.push({ provider: 'openrouter', key: or.key });
    }
    return accounts;
  } catch {
    return [];
  }
}

export function fmtAge(entry: AccountEntry): string {
  const knownAge = (entry as any).age;
  if (knownAge) return knownAge;
  return '';
}
