import { request } from 'node:https';
import type { Provider, ProviderUsage, UsageSection } from './types.js';

function httpsRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseBody);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export class WarpProvider implements Provider {
  readonly id = 'warp';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Warp';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const graphQLQuery = `
      query GetRequestLimitInfo($requestContext: RequestContext!) {
        user(requestContext: $requestContext) {
          __typename
          ... on UserOutput {
            user {
              requestLimitInfo {
                isUnlimited
                nextRefreshTime
                requestLimit
                requestsUsedSinceLastRefresh
              }
              bonusGrants {
                requestCreditsGranted
                requestCreditsRemaining
                expiration
              }
            }
          }
        }
      }
    `;

    const variables = {
      requestContext: {
        clientContext: {},
        osContext: {
          category: 'macOS',
          name: 'macOS',
          version: '14.0.0',
        },
      },
    };

    const body = JSON.stringify({
      query: graphQLQuery,
      variables,
      operationName: 'GetRequestLimitInfo',
    });

    const response = await httpsRequest(
      'https://app.warp.dev/graphql/v2?op=GetRequestLimitInfo',
      'POST',
      {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-warp-client-id': 'tokengauge',
        'x-warp-os-category': 'macOS',
        'x-warp-os-name': 'macOS',
        'x-warp-os-version': '14.0.0',
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': 'tokengauge/1.0.0',
      },
      body,
    );

    const parsed: unknown = JSON.parse(response);

    if (
      parsed &&
      typeof parsed === 'object' &&
      'errors' in parsed &&
      Array.isArray(parsed.errors) &&
      parsed.errors.length > 0
    ) {
      const messages = parsed.errors
        .map((e: unknown) => (e && typeof e === 'object' && 'message' in e ? String(e.message) : ''))
        .filter(Boolean)
        .slice(0, 3)
        .join(' | ');
      throw new Error(`GraphQL error: ${messages || 'Request failed'}`);
    }

    const data =
      parsed && typeof parsed === 'object' && 'data' in parsed
        ? (parsed.data as Record<string, unknown>)
        : undefined;
    const user = data?.user as Record<string, unknown> | undefined;
    const innerUser = user?.user as Record<string, unknown> | undefined;
    const limitInfo = innerUser?.requestLimitInfo as Record<string, unknown> | undefined;

    if (!limitInfo) {
      throw new Error('Unable to extract requestLimitInfo from response');
    }

    const isUnlimited = Boolean(limitInfo.isUnlimited);
    const requestLimit = Number(limitInfo.requestLimit) || 0;
    const requestsUsed = Number(limitInfo.requestsUsedSinceLastRefresh) || 0;
    const nextRefreshTime = limitInfo.nextRefreshTime ? String(limitInfo.nextRefreshTime) : null;

    let resetInSeconds: number | undefined;
    if (nextRefreshTime && !isUnlimited) {
      const resetDate = new Date(nextRefreshTime);
      const diff = Math.floor((resetDate.getTime() - Date.now()) / 1000);
      if (diff > 0) resetInSeconds = diff;
    }

    const sections: UsageSection[] = [];

    if (isUnlimited) {
      sections.push({
        label: 'Requests',
        usedPercent: 0,
        displayValue: 'Unlimited',
      });
    } else {
      const usedPct = requestLimit > 0 ? Math.min(100, Math.round((requestsUsed / requestLimit) * 100)) : 0;
      sections.push({
        label: 'Requests',
        usedPercent: usedPct,
        current: requestsUsed,
        max: requestLimit,
        resetInSeconds,
      });
    }

    const bonusGrants = innerUser?.bonusGrants as Array<Record<string, unknown>> | undefined;
    if (bonusGrants && bonusGrants.length > 0) {
      let totalBonus = 0;
      let remainingBonus = 0;
      for (const grant of bonusGrants) {
        totalBonus += Number(grant.requestCreditsGranted) || 0;
        remainingBonus += Number(grant.requestCreditsRemaining) || 0;
      }
      if (totalBonus > 0) {
        const usedBonus = totalBonus - remainingBonus;
        const bonusPct = Math.min(100, Math.round((usedBonus / totalBonus) * 100));
        sections.push({
          label: 'Bonus',
          usedPercent: bonusPct,
          current: usedBonus,
          max: totalBonus,
        });
      }
    }

    return {
      providerName: this.displayName,
      plan: isUnlimited ? 'Unlimited' : `${requestsUsed}/${requestLimit} credits`,
      sections,
    };
  }
}
