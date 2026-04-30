import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

export interface OAuthAuth {
  type: 'oauth';
  access: string;
  accountId?: string;
}

export interface ApiKeyAuth {
  type: 'apiKey';
  key: string;
}

export type Auth = OAuthAuth | ApiKeyAuth;

export function readAuth(customPath: string): Auth {
  const path = customPath || `${homedir()}/.local/share/opencode/auth.json`;
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw);
  const openai = parsed.openai;
  if (!openai) throw new Error('No "openai" key found in auth file');
  if (openai.type === 'oauth') {
    if (!openai.access) throw new Error('OAuth auth missing "access" token');
    return { type: 'oauth', access: openai.access, accountId: openai.accountId };
  }
  if (openai.type === 'apiKey') {
    if (!openai.key) throw new Error('API key auth missing "key"');
    return { type: 'apiKey', key: openai.key };
  }
  throw new Error(`Unknown auth type: ${openai.type}`);
}
