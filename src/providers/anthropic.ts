import type { Provider, ProviderUsage } from './types.js';

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic';
  readonly displayName = 'Anthropic';

  constructor(private apiKey: string) {}

  async fetchUsage(): Promise<ProviderUsage> {
    return {
      providerName: 'Anthropic',
      sections: [],
      credits: 'API key configured — usage API not yet available',
    };
  }
}
