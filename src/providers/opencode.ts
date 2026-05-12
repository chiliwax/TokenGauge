import type { Provider, ProviderUsage } from './types.js';
import {
  fetchOpenCodeSubscriptionText,
  normalizeOpenCodeCookieHeader,
  parseOpenCodeSubscription,
  resolveOpenCodeWorkspaceId,
} from './opencode-web.js';

export class OpenCodeProvider implements Provider {
  readonly id = 'opencode';
  readonly displayName: string;

  constructor(
    private cookieHeader: string,
    private workspaceId?: string,
    label?: string,
  ) {
    this.displayName = label ?? 'OpenCode Black';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const cookie = normalizeOpenCodeCookieHeader(this.cookieHeader);
    if (!cookie) {
      throw new Error('OpenCode Black session cookie is empty or invalid. Reconnect with a Cookie header from opencode.ai, or paste the raw auth cookie value.');
    }

    const workspaceId = await resolveOpenCodeWorkspaceId(cookie, this.workspaceId);
    const text = await fetchOpenCodeSubscriptionText(cookie, workspaceId);
    const usage = parseOpenCodeSubscription(text);

    return {
      providerName: this.displayName,
      sections: [
        {
          label: '5h window',
          usedPercent: usage.rollingUsage.usedPercent,
          resetInSeconds: usage.rollingUsage.resetInSeconds,
        },
        {
          label: 'Weekly',
          usedPercent: usage.weeklyUsage.usedPercent,
          resetInSeconds: usage.weeklyUsage.resetInSeconds,
        },
      ],
    };
  }
}
