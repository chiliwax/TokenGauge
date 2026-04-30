import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

export interface AccountEntry {
  provider: 'openai' | 'openrouter' | 'anthropic';
  key: string;
  type?: string;
  accountId?: string;
  label?: string;
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
