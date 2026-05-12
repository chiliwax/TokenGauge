import type { AccountEntry } from './config.js';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const DEVICE_USERCODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`;
const OAUTH_TOKEN_URL = `${ISSUER}/oauth/token`;
const DEVICE_VERIFY_URL = `${ISSUER}/codex/device`;
const DEVICE_REDIRECT_URI = `${ISSUER}/deviceauth/callback`;
const USER_AGENT = 'tokengauge/1.0';

export interface ChatGptDeviceAuth {
  deviceAuthId: string;
  userCode: string;
  intervalMs: number;
  verificationUrl: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

interface IdTokenClaims {
  chatgpt_account_id?: string;
  organizations?: Array<{ id?: string }>;
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string;
  };
}

export async function beginChatGptDeviceAuth(): Promise<ChatGptDeviceAuth> {
  const response = await fetch(DEVICE_USERCODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start ChatGPT authorization: HTTP ${response.status}`);
  }

  const data = toRecord(await response.json(), 'device authorization response');
  const interval = Number.parseInt(readString(data, 'interval', false) ?? '', 10);

  return {
    deviceAuthId: readString(data, 'device_auth_id', true),
    userCode: readString(data, 'user_code', true),
    intervalMs: Math.max(Number.isFinite(interval) ? interval : 5, 1) * 1000,
    verificationUrl: DEVICE_VERIFY_URL,
  };
}

export async function completeChatGptDeviceAuth(
  device: ChatGptDeviceAuth,
  signal?: AbortSignal,
): Promise<AccountEntry> {
  while (true) {
    await sleep(device.intervalMs, signal);

    const response = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        device_auth_id: device.deviceAuthId,
        user_code: device.userCode,
      }),
      signal,
    });

    if (!response.ok) continue;

    const codeData = toRecord(await response.json(), 'device token response');
    const tokens = await exchangeAuthorizationCode(
      readString(codeData, 'authorization_code', true),
      readString(codeData, 'code_verifier', true),
      signal,
    );

    return tokenResponseToAccount(tokens);
  }
}

export async function refreshChatGptAccessToken(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<AccountEntry> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
    signal,
  });

  if (!response.ok) {
    throw new Error(`ChatGPT token refresh failed: HTTP ${response.status}`);
  }

  const data = toRecord(await response.json(), 'token refresh response');
  const expiresIn = readNumber(data, 'expires_in', false);
  return tokenResponseToAccount({
    access_token: readString(data, 'access_token', true),
    refresh_token: readString(data, 'refresh_token', false) ?? refreshToken,
    expires_in: expiresIn,
    id_token: readString(data, 'id_token', false),
  });
}

async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  signal?: AbortSignal,
): Promise<TokenResponse> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: DEVICE_REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }).toString(),
    signal,
  });

  if (!response.ok) {
    throw new Error(`ChatGPT token exchange failed: HTTP ${response.status}`);
  }

  const data = toRecord(await response.json(), 'token response');
  const expiresIn = readNumber(data, 'expires_in', false);

  return {
    access_token: readString(data, 'access_token', true),
    refresh_token: readString(data, 'refresh_token', false),
    expires_in: expiresIn,
    id_token: readString(data, 'id_token', false),
  };
}

function tokenResponseToAccount(tokens: TokenResponse): AccountEntry {
  return {
    provider: 'chatgpt',
    key: tokens.access_token,
    type: 'oauth',
    ...(tokens.refresh_token ? { refresh: tokens.refresh_token } : {}),
    ...(tokens.expires_in ? { expires: Date.now() + tokens.expires_in * 1000 } : {}),
    ...(extractAccountId(tokens) ? { accountId: extractAccountId(tokens) } : {}),
  };
}

function extractAccountId(tokens: TokenResponse): string | undefined {
  const idClaims = tokens.id_token ? parseJwtClaims(tokens.id_token) : undefined;
  const idAccount = idClaims ? extractAccountIdFromClaims(idClaims) : undefined;
  if (idAccount) return idAccount;

  const accessClaims = parseJwtClaims(tokens.access_token);
  return accessClaims ? extractAccountIdFromClaims(accessClaims) : undefined;
}

function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    const record = toRecord(parsed, 'JWT claims');
    const authClaim = record['https://api.openai.com/auth'];
    const organizations = record.organizations;

    return {
      chatgpt_account_id: readString(record, 'chatgpt_account_id', false),
      ...(Array.isArray(organizations) ? { organizations: organizations.map(readOrganization).filter(isOrganization) } : {}),
      ...(isRecord(authClaim) ? {
        'https://api.openai.com/auth': {
          chatgpt_account_id: readString(authClaim, 'chatgpt_account_id', false),
        },
      } : {}),
    };
  } catch {
    return undefined;
  }
}

function extractAccountIdFromClaims(claims: IdTokenClaims): string | undefined {
  return claims.chatgpt_account_id
    ?? claims['https://api.openai.com/auth']?.chatgpt_account_id
    ?? claims.organizations?.find((organization) => organization.id)?.id;
}

function readOrganization(value: unknown): { id?: string } {
  if (!isRecord(value)) return {};
  return { id: readString(value, 'id', false) };
}

function isOrganization(value: { id?: string }): boolean {
  return Boolean(value.id);
}

function toRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, required: true): string;
function readString(record: Record<string, unknown>, key: string, required: false): string | undefined;
function readString(record: Record<string, unknown>, key: string, required: boolean): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value) return value;
  if (required) throw new Error(`Missing "${key}" in response`);
  return undefined;
}

function readNumber(record: Record<string, unknown>, key: string, required: true): number;
function readNumber(record: Record<string, unknown>, key: string, required: false): number | undefined;
function readNumber(record: Record<string, unknown>, key: string, required: boolean): number | undefined {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (required) throw new Error(`Missing "${key}" in response`);
  return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('ChatGPT authorization cancelled'));
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('ChatGPT authorization cancelled'));
    }, { once: true });
  });
}
