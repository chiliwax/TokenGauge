export interface UsageSection {
  label: string;
  usedPercent: number;
  current?: number;
  max?: number;
  remaining?: number;
  resetInSeconds?: number;
  displayValue?: string;
}

export interface ProviderUsage {
  providerName: string;
  plan?: string;
  sections: UsageSection[];
  credits?: string;
  error?: string;
}

export interface Provider {
  readonly id: string;
  readonly displayName: string;
  fetchUsage(): Promise<ProviderUsage>;
}
