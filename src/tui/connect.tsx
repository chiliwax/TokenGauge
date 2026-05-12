import { useEffect, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { AccountEntry } from '../config.js';
import {
  beginChatGptDeviceAuth,
  completeChatGptDeviceAuth,
  type ChatGptDeviceAuth,
} from '../openai-oauth.js';

interface ConnectPageProps {
  onDone: (result: AccountEntry | null) => void;
}

interface ProviderEntry {
  value: AccountEntry['provider'];
  label: string;
  tag: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface ProviderSection {
  title: string;
  providers: ProviderEntry[];
}

const PROVIDER_SECTIONS: ProviderSection[] = [
  {
    title: 'Working / Recommended',
    providers: [
      { value: 'chatgpt', label: 'ChatGPT Plus/Pro', tag: 'OAuth' },
      { value: 'openrouter', label: 'OpenRouter', tag: 'API key' },
      { value: 'deepseek', label: 'DeepSeek', tag: 'API key' },
      { value: 'moonshot', label: 'Moonshot', tag: 'API key' },
      { value: 'venice', label: 'Venice', tag: 'API key' },
      { value: 'perplexity', label: 'Perplexity', tag: 'API key' },
      { value: 'manus', label: 'Manus', tag: 'session' },
      { value: 'copilot', label: 'Copilot', tag: 'GitHub token' },
    ],
  },
  {
    title: 'Cookie / Web Session',
    providers: [
      { value: 'opencode', label: 'OpenCode Black', tag: 'cookie' },
      { value: 'opencode-go', label: 'OpenCode Go', tag: 'cookie' },
      { value: 'ollama', label: 'Ollama', tag: 'cookie' },
    ],
  },
  {
    title: 'Experimental',
    providers: [
      { value: 'crof', label: 'Crof', tag: 'experimental' },
      { value: 'warp', label: 'Warp', tag: 'experimental' },
      { value: 'synthetic', label: 'Synthetic', tag: 'experimental' },
      { value: 'codebuff', label: 'Codebuff', tag: 'experimental' },
      { value: 'zai', label: 'z.ai', tag: 'experimental' },
      { value: 'kilo', label: 'Kilo', tag: 'experimental' },
      { value: 'minimax', label: 'MiniMax', tag: 'experimental' },
    ],
  },
  {
    title: 'Coming Soon',
    providers: [
      { value: 'openai', label: 'OpenAI API', tag: 'coming soon', disabled: true, disabledReason: 'OpenAI API usage needs organization/admin usage endpoints; not implemented yet.' },
      { value: 'anthropic', label: 'Anthropic', tag: 'coming soon', disabled: true, disabledReason: 'Anthropic usage needs Admin API reports; not implemented yet.' },
      { value: 'doubao', label: 'Doubao', tag: 'coming soon', disabled: true, disabledReason: 'Doubao requires a chat completion to read rate-limit headers and is not recommended for general use.' },
    ],
  },
];

const ALL_PROVIDERS = PROVIDER_SECTIONS.flatMap(s => s.providers);
const PROVIDER_INDEX: Record<string, number> = {};
ALL_PROVIDERS.forEach((p, i) => { PROVIDER_INDEX[p.value] = i; });

function credentialPrompt(provider: AccountEntry['provider']): string {
  if (provider === 'opencode' || provider === 'opencode-go' || provider === 'ollama') {
    return `Paste your ${PROVIDER_LABELS[provider]} Cookie header or auth cookie value`;
  }
  if (provider === 'copilot') {
    return `Enter your ${PROVIDER_LABELS[provider]} GitHub token`;
  }
  if (provider === 'manus') {
    return `Enter your ${PROVIDER_LABELS[provider]} session token`;
  }
  if (provider === 'openai') {
    return `Enter your ${PROVIDER_LABELS[provider]} admin API key`;
  }
  return `Enter your ${PROVIDER_LABELS[provider]} API key`;
}

const PROVIDER_LABELS: Record<AccountEntry['provider'], string> = {
  chatgpt: 'ChatGPT Plus/Pro',
  openai: 'OpenAI API',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  opencode: 'OpenCode Black',
  'opencode-go': 'OpenCode Go',
  deepseek: 'DeepSeek',
  venice: 'Venice',
  moonshot: 'Moonshot',
  crof: 'Crof',
  warp: 'Warp',
  copilot: 'Copilot',
  synthetic: 'Synthetic',
  codebuff: 'Codebuff',
  zai: 'z.ai',
  perplexity: 'Perplexity',
  manus: 'Manus',
  doubao: 'Doubao',
  kilo: 'Kilo',
  minimax: 'MiniMax',
  ollama: 'Ollama',
};

type Phase =
  | { type: 'select' }
  | { type: 'input'; provider: AccountEntry['provider'] }
  | { type: 'workspace'; provider: AccountEntry['provider']; key: string }
  | { type: 'oauth-start'; error?: string }
  | { type: 'oauth-device'; device: ChatGptDeviceAuth; error?: string }
  | { type: 'label'; entry: AccountEntry }
  | { type: 'disabled'; entry: ProviderEntry };

function usesCookie(provider: AccountEntry['provider']): boolean {
  return provider === 'opencode' || provider === 'opencode-go' || provider === 'ollama';
}

function usesWorkspace(provider: AccountEntry['provider']): boolean {
  return provider === 'opencode' || provider === 'opencode-go';
}

function buildCredentialEntry(
  provider: AccountEntry['provider'],
  key: string,
  workspaceId?: string,
): AccountEntry {
  return {
    provider,
    key,
    ...(workspaceId ? { workspaceId } : {}),
  };
}

function addLabel(entry: AccountEntry, label?: string): AccountEntry {
  return {
    ...entry,
    ...(label ? { label } : {}),
  };
}

export function ConnectPage({ onDone }: ConnectPageProps) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>({ type: 'select' });
  const [cursor, setCursor] = useState(0);
  const [buffer, setBuffer] = useState('');

  useInput((input, key) => {
    if (phase.type === 'select') {
      if (key.upArrow && cursor > 0) {
        setCursor(cursor - 1);
      } else if (key.downArrow && cursor < ALL_PROVIDERS.length - 1) {
        setCursor(cursor + 1);
      } else if (key.return) {
        const entry = ALL_PROVIDERS[cursor];
        if (entry.disabled) {
          setPhase({ type: 'disabled', entry });
        } else if (entry.value === 'chatgpt') {
          setPhase({ type: 'oauth-start' });
          setCursor(0);
          setBuffer('');
        } else {
          setPhase({ type: 'input', provider: entry.value });
          setCursor(0);
          setBuffer('');
        }
      } else if (key.escape) {
        onDone(null);
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      }
    } else if (phase.type === 'input') {
      if (key.escape) {
        setPhase({ type: 'select' });
        setBuffer('');
      } else if (key.return && buffer.trim()) {
        if (usesWorkspace(phase.provider)) {
          setPhase({ type: 'workspace', provider: phase.provider, key: buffer.trim() });
        } else {
          setPhase({ type: 'label', entry: buildCredentialEntry(phase.provider, buffer.trim()) });
        }
        setBuffer('');
      } else if (key.backspace) {
        setBuffer(buffer.slice(0, -1));
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      } else if (!key.ctrl && input) {
        setBuffer(buffer + input);
      }
    } else if (phase.type === 'workspace') {
      if (key.escape) {
        setPhase({ type: 'label', entry: buildCredentialEntry(phase.provider, phase.key) });
        setBuffer('');
      } else if (key.return) {
        const workspaceId = buffer.trim() || undefined;
        setPhase({ type: 'label', entry: buildCredentialEntry(phase.provider, phase.key, workspaceId) });
        setBuffer('');
      } else if (key.backspace) {
        setBuffer(buffer.slice(0, -1));
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      } else if (!key.ctrl && input) {
        setBuffer(buffer + input);
      }
    } else if (phase.type === 'oauth-start' || phase.type === 'oauth-device') {
      if (key.escape) {
        setPhase({ type: 'select' });
        setBuffer('');
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      }
    } else if (phase.type === 'disabled') {
      if (key.escape || key.return) {
        setPhase({ type: 'select' });
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      }
    } else if (phase.type === 'label') {
      if (key.escape) {
        onDone(phase.entry);
      } else if (key.return) {
        const prefix = buffer.trim();
        const label = prefix ? `${prefix}-${PROVIDER_LABELS[phase.entry.provider]}` : undefined;
        onDone(addLabel(phase.entry, label));
      } else if (key.backspace) {
        setBuffer(buffer.slice(0, -1));
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      } else if (!key.ctrl && input) {
        setBuffer(buffer + input);
      }
    }
  });

  useEffect(() => {
    if (phase.type !== 'oauth-start' || phase.error) return;

    let cancelled = false;
    beginChatGptDeviceAuth()
      .then((device) => {
        if (!cancelled) setPhase({ type: 'oauth-device', device });
      })
      .catch((error: unknown) => {
        if (!cancelled) setPhase({ type: 'oauth-start', error: errorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => {
    if (phase.type !== 'oauth-device' || phase.error) return;

    const abort = new AbortController();
    completeChatGptDeviceAuth(phase.device, abort.signal)
      .then((entry) => {
        setPhase({ type: 'label', entry });
        setBuffer('');
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setPhase({ type: 'oauth-device', device: phase.device, error: errorMessage(error) });
        }
      });

    return () => {
      abort.abort();
    };
  }, [phase]);

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
      {phase.type === 'select' && (
        <>
          <Text bold>Connect a provider</Text>
          <Box flexDirection="column" marginTop={1}>
            {PROVIDER_SECTIONS.map((section, si) => (
              <Box flexDirection="column" key={si}>
                {si > 0 && <Text> </Text>}
                <Text bold dimColor>{'  '}{section.title}</Text>
                {section.providers.map((p) => {
                  const idx = PROVIDER_INDEX[p.value];
                  const isSelected = idx === cursor;
                  const isDisabled = p.disabled ?? false;
                  return (
                    <Text key={p.value}>
                      {'  '}{isSelected ? <Text bold>{'>'}</Text> : ' '} <Text dimColor={isDisabled}>{p.label}</Text>{' '}<Text dimColor>({p.tag})</Text>
                    </Text>
                  );
                })}
              </Box>
            ))}
          </Box>
          <Text dimColor>{'  '}↑↓ navigate · Enter select · Esc cancel</Text>
        </>
      )}

      {phase.type === 'input' && (
        <>
          <Text bold>{credentialPrompt(phase.provider)}</Text>
          {phase.provider === 'perplexity' && (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>{'  '}Perplexity exposes model access via API key, but no public</Text>
              <Text dimColor>{'  '}account usage endpoint. TokenGauge will only show that the key is configured.</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
          </Box>
          <Text dimColor>{'  '}Enter confirm · Esc cancel</Text>
        </>
      )}

      {phase.type === 'oauth-start' && (
        <>
          <Text bold>ChatGPT Plus/Pro authorization</Text>
          {phase.error ? (
            <Text color="red">{'  '}{phase.error}</Text>
          ) : (
            <Text dimColor>{'  '}Requesting device code...</Text>
          )}
          <Text dimColor>{'  '}Esc cancel</Text>
        </>
      )}

      {phase.type === 'oauth-device' && (
        <>
          <Text bold>ChatGPT Plus/Pro authorization</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text>{'  '}Open: <Text color="cyan">{phase.device.verificationUrl}</Text></Text>
            <Text>{'  '}Code: <Text bold>{phase.device.userCode}</Text></Text>
          </Box>
          {phase.error ? (
            <Text color="red">{'  '}{phase.error}</Text>
          ) : (
            <Text dimColor>{'  '}Waiting for authorization...</Text>
          )}
          <Text dimColor>{'  '}Esc cancel</Text>
        </>
      )}

      {phase.type === 'disabled' && (
        <>
          <Text bold>{phase.entry.label}</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text color="yellow">{'  '}This provider is not yet available.</Text>
            <Text dimColor>{'  '}{phase.entry.disabledReason}</Text>
          </Box>
          <Text dimColor>{'  '}Esc or Enter to go back</Text>
        </>
      )}

      {phase.type === 'workspace' && (
        <>
          <Text bold>Workspace ID or URL (optional)</Text>
          <Text dimColor>{'  '}Use wrk_... or https://opencode.ai/workspace/...; leave blank to use the first workspace.</Text>
          <Box marginTop={1}>
            <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
          </Box>
          <Text dimColor>{'  '}Enter confirm · Esc skip</Text>
        </>
      )}

      {phase.type === 'label' && (
        <>
          <Text bold>Account name (optional)</Text>
          <Text dimColor>{'  '}e.g. &quot;main&quot; → &quot;main-{PROVIDER_LABELS[phase.entry.provider]}&quot;</Text>
          <Box marginTop={1}>
            <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
          </Box>
          <Text dimColor>{'  '}Enter confirm · Esc skip</Text>
        </>
      )}
    </Box>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
