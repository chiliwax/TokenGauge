import type { Provider, ProviderUsage } from './types.js';

export class PerplexityProvider implements Provider {
  readonly id = 'perplexity';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ?? 'Perplexity';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    return {
      providerName: this.displayName,
      sections: [],
      credits: this.apiKey
        ? 'API key configured — Perplexity does not expose account usage via API'
        : 'API key missing',
    };
  }
}
