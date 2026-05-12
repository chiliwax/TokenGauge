import type { Provider, ProviderUsage, UsageSection } from './types.js';
import {
  fetchOpenCodeGoUsageText,
  normalizeOpenCodeCookieHeader,
  parseOpenCodeGoSubscription,
  resolveOpenCodeWorkspaceId,
} from './opencode-web.js';

export class OpenCodeGoProvider implements Provider {
  readonly id = 'opencode-go';
  readonly displayName: string;

  constructor(
    private cookieHeader: string,
    private workspaceId?: string,
    label?: string,
  ) {
    this.displayName = label ?? 'OpenCode Go';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    if (this.cookieHeader.trim() === 'local') {
      throw new Error('OpenCode Go local DB tracking was replaced by live web quota tracking. Reconnect OpenCode Go with an opencode.ai Cookie header.');
    }

    const cookie = normalizeOpenCodeCookieHeader(this.cookieHeader);
    if (!cookie) {
      throw new Error('OpenCode Go session cookie is empty or invalid. Reconnect with a Cookie header from opencode.ai, or paste the raw auth cookie value.');
    }

    const workspaceId = await resolveOpenCodeWorkspaceId(cookie, this.workspaceId);
    const text = await fetchOpenCodeGoUsageText(cookie, workspaceId);
    const usage = parseOpenCodeGoSubscription(text);

    const sections: UsageSection[] = [
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
    ];

    if (usage.monthlyUsage) {
      sections.push({
        label: 'Monthly',
        usedPercent: usage.monthlyUsage.usedPercent,
        resetInSeconds: usage.monthlyUsage.resetInSeconds,
      });
    }

    return {
      providerName: this.displayName,
      sections,
    };
  }
}
