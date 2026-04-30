import type { Provider, ProviderUsage } from './types.js';

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic';
  readonly displayName: string;

  constructor(private apiKey: string, label?: string) {
    this.displayName = label ? `Anthropic — ${label}` : 'Anthropic';
  }

  async fetchUsage(): Promise<ProviderUsage> {
    return {
      providerName: 'Anthropic',
      sections: [],
      credits: 'API key configured — usage API not yet available',
    };
  }
}
