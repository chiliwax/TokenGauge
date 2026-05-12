import { randomUUID } from 'node:crypto';

const BASE_URL = 'https://opencode.ai';
const SERVER_URL = `${BASE_URL}/_server`;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

export const OPENCODE_WORKSPACES_SERVER_ID = 'def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f';
export const OPENCODE_SUBSCRIPTION_SERVER_ID = '7abeebee372f304e050aaaf92be863f4a86490e382f8c79db68fd94040d691b4';

const PERCENT_KEYS = [
  'usagePercent',
  'usedPercent',
  'percentUsed',
  'percent',
  'usage_percent',
  'used_percent',
  'utilization',
  'utilizationPercent',
  'utilization_percent',
  'usage',
];

const RESET_IN_KEYS = [
  'resetInSec',
  'resetInSeconds',
  'resetSeconds',
  'reset_sec',
  'reset_in_sec',
  'resetsInSec',
  'resetsInSeconds',
  'resetIn',
  'resetSec',
];

const RESET_AT_KEYS = [
  'resetAt',
  'resetsAt',
  'reset_at',
  'resets_at',
  'nextReset',
  'next_reset',
  'renewAt',
  'renew_at',
];

interface ServerRequest {
  serverId: string;
  args?: unknown[];
  method: 'GET' | 'POST';
  referer: string;
}

export interface ParsedUsageWindow {
  usedPercent: number;
  resetInSeconds: number;
}

export interface ParsedSubscriptionUsage {
  rollingUsage: ParsedUsageWindow;
  weeklyUsage: ParsedUsageWindow;
  monthlyUsage?: ParsedUsageWindow;
}

type AnyRecord = Record<string, unknown>;

interface WindowCandidate extends ParsedUsageWindow {
  id: number;
  pathLower: string;
}

export function normalizeOpenCodeCookieHeader(raw: string | undefined | null): string | null {
  if (!raw) return null;

  let text = raw.trim();
  if (!text) return null;

  const cookieHeaderMatch = text.match(/\bcookie\s*:\s*([^'"\n\r]+)/i);
  if (cookieHeaderMatch) {
    text = cookieHeaderMatch[1];
  } else {
    text = text.replace(/^\s*cookie\s*:\s*/i, '');
  }

  text = text.trim().replace(/^['"]|['"]$/g, '');

  if (!text.includes('=') && looksLikeRawCookieValue(text)) {
    return `auth=${text}; __Host-auth=${text}`;
  }

  const seen = new Set<string>();
  const allPairs: string[] = [];

  for (const rawPart of text.split(';')) {
    const part = rawPart.trim();
    const eq = part.indexOf('=');
    if (eq <= 0) continue;

    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value || seen.has(name)) continue;

    seen.add(name);
    const pair = `${name}=${value}`;
    allPairs.push(pair);
  }

  return allPairs.join('; ') || null;
}

function looksLikeRawCookieValue(text: string): boolean {
  return /^[A-Za-z0-9%._~!*()+/=-]+$/.test(text);
}

export function normalizeOpenCodeWorkspaceId(raw: string | undefined | null): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^wrk_[A-Za-z0-9]+$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.indexOf('workspace');
    if (index >= 0) {
      const candidate = parts[index + 1];
      if (candidate && /^wrk_[A-Za-z0-9]+$/.test(candidate)) return candidate;
    }
  } catch {
    // Not a URL; fall through to extracting a workspace-like token.
  }

  return trimmed.match(/wrk_[A-Za-z0-9]+/)?.[0] ?? null;
}

export function parseOpenCodeWorkspaceIds(text: string): string[] {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };

  const object = tryJsonParse(text);
  if (object !== undefined) collectWorkspaceIds(object, add);

  for (const match of text.matchAll(/\bid\s*[:=]\s*["'](wrk_[A-Za-z0-9]+)["']/g)) {
    add(match[1]);
  }

  for (const match of text.matchAll(/\bwrk_[A-Za-z0-9]+\b/g)) {
    add(match[0]);
  }

  return ids;
}

export async function resolveOpenCodeWorkspaceId(
  cookieHeader: string,
  workspaceIdOverride?: string,
  timeoutMs = 10000,
): Promise<string> {
  const override = normalizeOpenCodeWorkspaceId(workspaceIdOverride);
  if (override) return override;

  const text = await fetchOpenCodeServerText({
    serverId: OPENCODE_WORKSPACES_SERVER_ID,
    method: 'GET',
    referer: BASE_URL,
  }, cookieHeader, timeoutMs, 'OpenCode');

  let ids = parseOpenCodeWorkspaceIds(text);
  if (ids.length > 0) return ids[0];

  const fallback = await fetchOpenCodeServerText({
    serverId: OPENCODE_WORKSPACES_SERVER_ID,
    args: [],
    method: 'POST',
    referer: BASE_URL,
  }, cookieHeader, timeoutMs, 'OpenCode');

  ids = parseOpenCodeWorkspaceIds(fallback);
  if (ids.length > 0) return ids[0];

  throw new Error('OpenCode parse error: Missing workspace id.');
}

export async function fetchOpenCodeSubscriptionText(
  cookieHeader: string,
  workspaceId: string,
  timeoutMs = 10000,
): Promise<string> {
  const referer = `${BASE_URL}/workspace/${workspaceId}/billing`;
  const text = await fetchOpenCodeServerText({
    serverId: OPENCODE_SUBSCRIPTION_SERVER_ID,
    args: [workspaceId],
    method: 'GET',
    referer,
  }, cookieHeader, timeoutMs, 'OpenCode');

  if (isExplicitNullPayload(text)) throw missingSubscriptionDataError(workspaceId);
  if (tryParseOpenCodeSubscription(text)) return text;

  const fallback = await fetchOpenCodeServerText({
    serverId: OPENCODE_SUBSCRIPTION_SERVER_ID,
    args: [workspaceId],
    method: 'POST',
    referer,
  }, cookieHeader, timeoutMs, 'OpenCode');

  if (isExplicitNullPayload(fallback)) throw missingSubscriptionDataError(workspaceId);
  return fallback;
}

export async function fetchOpenCodeGoUsageText(
  cookieHeader: string,
  workspaceId: string,
  timeoutMs = 10000,
): Promise<string> {
  return fetchOpenCodePageText(
    `${BASE_URL}/workspace/${workspaceId}/go`,
    cookieHeader,
    timeoutMs,
    'OpenCode Go',
  );
}

export function parseOpenCodeSubscription(text: string): ParsedSubscriptionUsage {
  const parsed = tryParseOpenCodeSubscription(text);
  if (!parsed) throw new Error('OpenCode parse error: Missing usage fields.');
  return parsed;
}

export function tryParseOpenCodeSubscription(text: string): ParsedSubscriptionUsage | null {
  return parseSubscriptionUsage(text, false);
}

export function parseOpenCodeGoSubscription(text: string): ParsedSubscriptionUsage {
  const parsed = tryParseOpenCodeGoSubscription(text);
  if (!parsed) throw new Error('OpenCode Go parse error: Missing usage fields.');
  return parsed;
}

export function tryParseOpenCodeGoSubscription(text: string): ParsedSubscriptionUsage | null {
  return parseSubscriptionUsage(text, true);
}

function missingSubscriptionDataError(workspaceId: string): Error {
  return new Error(`OpenCode API error: No subscription usage data was returned for workspace ${workspaceId}. This usually means this workspace does not have OpenCode Black usage data.`);
}

async function fetchOpenCodeServerText(
  request: ServerRequest,
  cookieHeader: string,
  timeoutMs: number,
  providerName: string,
): Promise<string> {
  const url = serverRequestUrl(request);
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    'X-Server-Id': request.serverId,
    'X-Server-Instance': `server-fn:${randomUUID()}`,
    'User-Agent': USER_AGENT,
    Origin: BASE_URL,
    Referer: request.referer,
    Accept: 'text/javascript, application/json;q=0.9, */*;q=0.8',
  };

  let body: string | undefined;
  if (request.method !== 'GET') {
    body = JSON.stringify(request.args ?? []);
    headers['Content-Type'] = 'application/json';
  }

  return fetchText(url, { method: request.method, headers, body }, timeoutMs, providerName);
}

async function fetchOpenCodePageText(
  url: string,
  cookieHeader: string,
  timeoutMs: number,
  providerName: string,
): Promise<string> {
  return fetchText(url, {
    method: 'GET',
    headers: {
      Cookie: cookieHeader,
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  }, timeoutMs, providerName);
}

function serverRequestUrl(request: ServerRequest): string {
  const url = new URL(SERVER_URL);
  url.searchParams.set('id', request.serverId);
  if (request.method === 'GET' && request.args && request.args.length > 0) {
    url.searchParams.set('args', JSON.stringify(request.args));
  }
  return url.toString();
}

async function fetchText(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  providerName: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let body: string;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    body = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${providerName} network error: request timed out.`);
    }
    throw new Error(`${providerName} network error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  if (looksSignedOut(body) || response.status === 401 || response.status === 403) {
    throw new Error(`${providerName} session cookie is invalid or expired. Reconnect with a fresh opencode.ai Cookie header.`);
  }

  if (!response.ok) {
    const detail = extractServerErrorMessage(body);
    throw new Error(`${providerName} API error: HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return body;
}

function parseSubscriptionUsage(text: string, includeMonthly: boolean): ParsedSubscriptionUsage | null {
  const object = tryJsonParse(text);
  if (object !== undefined) {
    const parsed = parseUsageObject(object, includeMonthly);
    if (parsed) return parsed;
  }

  return parseUsageText(text, includeMonthly);
}

function parseUsageObject(object: unknown, includeMonthly: boolean): ParsedSubscriptionUsage | null {
  if (typeof object === 'string') {
    const nested = tryJsonParse(object);
    if (nested !== undefined) {
      const parsed = parseUsageObject(nested, includeMonthly);
      if (parsed) return parsed;
    }
    return parseUsageText(object, includeMonthly);
  }

  const direct = parseUsageDictionary(object, includeMonthly);
  if (direct) return direct;

  const nested = parseUsageNested(object, includeMonthly, 0);
  if (nested) return nested;

  return parseUsageFromCandidates(object, includeMonthly);
}

function parseUsageDictionary(value: unknown, includeMonthly: boolean): ParsedSubscriptionUsage | null {
  if (!isRecord(value)) return null;

  const usage = firstRecord(value, ['usage']);
  if (usage) {
    const parsed = parseUsageDictionary(usage, includeMonthly);
    if (parsed) return parsed;
  }

  for (const key of ['data', 'result', 'billing', 'payload']) {
    const nested = firstRecord(value, [key]);
    if (!nested) continue;
    const parsed = parseUsageDictionary(nested, includeMonthly);
    if (parsed) return parsed;
  }

  const rolling = firstRecord(value, ['rollingUsage', 'rolling', 'rolling_usage', 'rollingWindow', 'rolling_window']);
  const weekly = firstRecord(value, ['weeklyUsage', 'weekly', 'weekly_usage', 'weeklyWindow', 'weekly_window']);
  const monthly = includeMonthly
    ? firstRecord(value, ['monthlyUsage', 'monthly', 'monthly_usage', 'monthlyWindow', 'monthly_window'])
    : null;

  if (!rolling || !weekly) return null;
  return buildUsage(rolling, weekly, monthly);
}

function parseUsageNested(value: unknown, includeMonthly: boolean, depth: number): ParsedSubscriptionUsage | null {
  if (depth > 3) return null;

  if (typeof value === 'string') {
    return parseUsageObject(value, includeMonthly);
  }

  if (isRecord(value)) {
    let rolling: AnyRecord | null = null;
    let weekly: AnyRecord | null = null;
    let monthly: AnyRecord | null = null;

    for (const [key, child] of Object.entries(value)) {
      if (!isRecord(child)) continue;
      const lower = key.toLowerCase();
      if (lower.includes('rolling') || lower.includes('hour') || lower.includes('5h') || lower.includes('5-hour')) {
        rolling = child;
      } else if (lower.includes('weekly') || lower.includes('week')) {
        weekly = child;
      } else if (includeMonthly && (lower.includes('monthly') || lower.includes('month'))) {
        monthly = child;
      }
    }

    if (rolling && weekly) {
      const parsed = buildUsage(rolling, weekly, monthly);
      if (parsed) return parsed;
    }

    for (const child of Object.values(value)) {
      const parsed = parseUsageNested(child, includeMonthly, depth + 1);
      if (parsed) return parsed;
    }
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      const parsed = parseUsageNested(child, includeMonthly, depth + 1);
      if (parsed) return parsed;
    }
  }

  return null;
}

function parseUsageFromCandidates(object: unknown, includeMonthly: boolean): ParsedSubscriptionUsage | null {
  const candidates = collectWindowCandidates(object);
  if (candidates.length === 0) return null;

  const rollingCandidates = candidates.filter((candidate) => {
    const path = candidate.pathLower;
    return path.includes('rolling') || path.includes('hour') || path.includes('5h') || path.includes('5-hour');
  });
  const weeklyCandidates = candidates.filter((candidate) => {
    const path = candidate.pathLower;
    return path.includes('weekly') || path.includes('week');
  });

  const rolling = pickCandidate(rollingCandidates, candidates, true);
  const weekly = pickCandidate(weeklyCandidates, candidates, false, rolling?.id);

  if (!rolling || !weekly) return null;

  let monthly: WindowCandidate | null = null;
  if (includeMonthly) {
    const monthlyCandidates = candidates.filter((candidate) => {
      const path = candidate.pathLower;
      return path.includes('monthly') || path.includes('month');
    });
    monthly = pickCandidate(monthlyCandidates, [], false, rolling.id, weekly.id);
  }

  return {
    rollingUsage: toUsageWindow(rolling),
    weeklyUsage: toUsageWindow(weekly),
    ...(monthly ? { monthlyUsage: toUsageWindow(monthly) } : {}),
  };
}

function collectWindowCandidates(object: unknown): WindowCandidate[] {
  const candidates: WindowCandidate[] = [];
  let nextId = 1;

  const collect = (value: unknown, path: string[]) => {
    if (isRecord(value)) {
      const window = parseWindow(value);
      if (window) {
        candidates.push({
          id: nextId,
          pathLower: path.join('.').toLowerCase(),
          ...window,
        });
        nextId += 1;
      }

      for (const [key, child] of Object.entries(value)) collect(child, [...path, key]);
    } else if (Array.isArray(value)) {
      value.forEach((child, index) => collect(child, [...path, `[${index}]`]));
    }
  };

  collect(object, []);
  return candidates;
}

function parseUsageText(text: string, includeMonthly: boolean): ParsedSubscriptionUsage | null {
  const rolling = parseTextWindow(text, 'rollingUsage');
  const weekly = parseTextWindow(text, 'weeklyUsage');
  if (!rolling || !weekly) return null;

  const monthly = includeMonthly ? parseTextWindow(text, 'monthlyUsage') : null;
  return {
    rollingUsage: rolling,
    weeklyUsage: weekly,
    ...(monthly ? { monthlyUsage: monthly } : {}),
  };
}

function parseTextWindow(text: string, key: string): ParsedUsageWindow | null {
  const block = extractObjectBlock(text, key) ?? text.slice(Math.max(0, text.indexOf(key)), text.indexOf(key) + 1000);
  if (!block || block.length === 0) return null;

  const percent = extractNumberByKeys(block, PERCENT_KEYS);
  if (percent == null) return null;

  let usedPercent = percent;
  if (usedPercent >= 0 && usedPercent <= 1) usedPercent *= 100;

  const resetInSeconds = extractNumberByKeys(block, RESET_IN_KEYS);
  const resetAt = extractValueByKeys(block, RESET_AT_KEYS);
  const resetFromDate = resetAt == null ? null : secondsUntil(resetAt);

  return {
    usedPercent: clampPercent(usedPercent),
    resetInSeconds: Math.max(0, Math.trunc(resetInSeconds ?? resetFromDate ?? 0)),
  };
}

function extractObjectBlock(text: string, key: string): string | null {
  const match = new RegExp(`["']?${escapeRegExp(key)}["']?\\s*[:=]\\s*(?:\\$R\\[\\d+\\]\\s*=\\s*)?\\{`, 'i').exec(text);
  if (!match) return null;

  const start = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start, start + 1000);
}

function buildUsage(
  rolling: AnyRecord,
  weekly: AnyRecord,
  monthly: AnyRecord | null,
): ParsedSubscriptionUsage | null {
  const rollingUsage = parseWindow(rolling);
  const weeklyUsage = parseWindow(weekly);
  if (!rollingUsage || !weeklyUsage) return null;

  const monthlyUsage = monthly ? parseWindow(monthly) : null;
  return {
    rollingUsage,
    weeklyUsage,
    ...(monthlyUsage ? { monthlyUsage } : {}),
  };
}

function parseWindow(record: AnyRecord): ParsedUsageWindow | null {
  let percent = numberFromKeys(record, PERCENT_KEYS);
  if (percent == null) {
    const used = numberFromKeys(record, ['used', 'usage', 'consumed', 'count', 'usedTokens']);
    const limit = numberFromKeys(record, ['limit', 'total', 'quota', 'max', 'cap', 'tokenLimit']);
    if (used != null && limit != null && limit > 0) percent = (used / limit) * 100;
  }

  if (percent == null) return null;
  if (percent >= 0 && percent <= 1) percent *= 100;

  const resetIn = numberFromKeys(record, RESET_IN_KEYS);
  const resetAt = valueFromKeys(record, RESET_AT_KEYS);

  return {
    usedPercent: clampPercent(percent),
    resetInSeconds: Math.max(0, Math.trunc(resetIn ?? secondsUntil(resetAt) ?? 0)),
  };
}

function pickCandidate(
  preferred: WindowCandidate[],
  fallback: WindowCandidate[],
  pickShorter: boolean,
  ...excludedIds: Array<number | undefined>
): WindowCandidate | null {
  const excluded = new Set(excludedIds.filter((id): id is number => id != null));
  const pool = (preferred.length > 0 ? preferred : fallback).filter((candidate) => !excluded.has(candidate.id));
  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => {
    const resetDelta = pickShorter
      ? a.resetInSeconds - b.resetInSeconds
      : b.resetInSeconds - a.resetInSeconds;
    if (resetDelta !== 0) return resetDelta;
    return b.usedPercent - a.usedPercent;
  })[0];
}

function toUsageWindow(candidate: WindowCandidate): ParsedUsageWindow {
  return {
    usedPercent: candidate.usedPercent,
    resetInSeconds: candidate.resetInSeconds,
  };
}

function firstRecord(record: AnyRecord, keys: string[]): AnyRecord | null {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
  }
  return null;
}

function collectWorkspaceIds(value: unknown, add: (id: string) => void): void {
  if (typeof value === 'string') {
    if (/^wrk_[A-Za-z0-9]+$/.test(value)) add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) collectWorkspaceIds(child, add);
    return;
  }

  if (isRecord(value)) {
    for (const child of Object.values(value)) collectWorkspaceIds(child, add);
  }
}

function looksSignedOut(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('<title>login')
    || lower.includes('>login<')
    || lower.includes('>log in<')
    || lower.includes('>sign in<')
    || lower.includes('auth/authorize')
    || lower.includes('not associated with an account')
    || lower.includes('actor of type "public"');
}

function isExplicitNullPayload(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.toLowerCase() === 'null') return true;
  return tryJsonParse(trimmed) === null;
}

function extractServerErrorMessage(text: string): string | null {
  const object = tryJsonParse(text);
  if (isRecord(object)) {
    for (const key of ['message', 'error', 'detail']) {
      const value = object[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }

  return text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

function numberFromKeys(record: AnyRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberFromValue(record[key]);
    if (value != null) return value;
  }
  return null;
}

function valueFromKeys(record: AnyRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return null;
}

function numberFromValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?/.test(trimmed)) {
      const parsed = Number.parseFloat(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function secondsUntil(value: unknown): number | null {
  const number = numberFromValue(value);
  if (number != null) {
    if (number > 1_000_000_000_000) return Math.max(0, Math.trunc((number - Date.now()) / 1000));
    if (number > 1_000_000_000) return Math.max(0, Math.trunc(number - Date.now() / 1000));
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.max(0, Math.trunc((parsed - Date.now()) / 1000));
  }

  return null;
}

function extractNumberByKeys(text: string, keys: string[]): number | null {
  const value = extractValueByKeys(text, keys);
  return value == null ? null : numberFromValue(value);
}

function extractValueByKeys(text: string, keys: string[]): string | null {
  const keyPattern = keys.map(escapeRegExp).join('|');
  const match = new RegExp(`["']?(?:${keyPattern})["']?\\s*[:=]\\s*["']?([^"',}\\s]+)`, 'i').exec(text);
  return match?.[1] ?? null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function tryJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
