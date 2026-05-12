import { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { AccountEntry } from '../config.js';

interface ConnectPageProps {
  onDone: (result: AccountEntry | null) => void;
}

type AuthType = 'API key' | 'Cookie' | 'GitHub token' | 'Session token' | 'API key / OAuth';

const PROVIDER_ROWS: { value: AccountEntry['provider']; label: string; auth: AuthType }[] = [
  { value: 'openai', label: 'OpenAI', auth: 'API key / OAuth' },
  { value: 'openrouter', label: 'OpenRouter', auth: 'API key' },
  { value: 'anthropic', label: 'Anthropic', auth: 'API key' },
  { value: 'opencode', label: 'OpenCode Black', auth: 'Cookie' },
  { value: 'opencode-go', label: 'OpenCode Go', auth: 'Cookie' },
  { value: 'deepseek', label: 'DeepSeek', auth: 'API key' },
  { value: 'venice', label: 'Venice', auth: 'API key' },
  { value: 'moonshot', label: 'Moonshot', auth: 'API key' },
  { value: 'crof', label: 'Crof', auth: 'API key' },
  { value: 'warp', label: 'Warp', auth: 'API key' },
  { value: 'copilot', label: 'Copilot', auth: 'GitHub token' },
  { value: 'synthetic', label: 'Synthetic', auth: 'API key' },
  { value: 'codebuff', label: 'Codebuff', auth: 'API key' },
  { value: 'zai', label: 'z.ai', auth: 'API key' },
  { value: 'perplexity', label: 'Perplexity', auth: 'Cookie' },
  { value: 'manus', label: 'Manus', auth: 'Session token' },
  { value: 'doubao', label: 'Doubao', auth: 'API key' },
  { value: 'kilo', label: 'Kilo', auth: 'API key' },
  { value: 'minimax', label: 'MiniMax', auth: 'API key' },
  { value: 'ollama', label: 'Ollama', auth: 'Cookie' },
];
const PROVIDERS = [...PROVIDER_ROWS].sort((a, b) => a.label.localeCompare(b.label));

function credentialPrompt(provider: AccountEntry['provider']): string {
  if (provider === 'opencode' || provider === 'opencode-go' || provider === 'perplexity' || provider === 'ollama') {
    return `Paste your ${PROVIDER_LABELS[provider]} Cookie header or auth cookie value`;
  }
  if (provider === 'copilot') {
    return `Enter your ${PROVIDER_LABELS[provider]} GitHub token`;
  }
  if (provider === 'manus') {
    return `Enter your ${PROVIDER_LABELS[provider]} session token`;
  }
  return `Enter your ${PROVIDER_LABELS[provider]} API key`;
}

const PROVIDER_LABELS: Record<AccountEntry['provider'], string> = {
  openai: 'OpenAI',
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
  | { type: 'label'; provider: AccountEntry['provider']; key: string; workspaceId?: string };

function usesCookie(provider: AccountEntry['provider']): boolean {
  return provider === 'opencode' || provider === 'opencode-go' || provider === 'perplexity' || provider === 'ollama';
}

function buildEntry(phase: Extract<Phase, { type: 'label' }>, label?: string): AccountEntry {
  return {
    provider: phase.provider,
    key: phase.key,
    ...(label ? { label } : {}),
    ...(phase.workspaceId ? { workspaceId: phase.workspaceId } : {}),
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
      } else if (key.downArrow && cursor < PROVIDERS.length - 1) {
        setCursor(cursor + 1);
      } else if (key.return) {
        const provider = PROVIDERS[cursor].value;
        setPhase({ type: 'input', provider });
        setCursor(0);
        setBuffer('');
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
        if (usesCookie(phase.provider)) {
          setPhase({ type: 'workspace', provider: phase.provider, key: buffer.trim() });
        } else {
          setPhase({ type: 'label', provider: phase.provider, key: buffer.trim() });
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
        setPhase({ type: 'label', provider: phase.provider, key: phase.key });
        setBuffer('');
      } else if (key.return) {
        const workspaceId = buffer.trim() || undefined;
        setPhase({ type: 'label', provider: phase.provider, key: phase.key, workspaceId });
        setBuffer('');
      } else if (key.backspace) {
        setBuffer(buffer.slice(0, -1));
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      } else if (!key.ctrl && input) {
        setBuffer(buffer + input);
      }
    } else if (phase.type === 'label') {
      if (key.escape) {
        onDone(buildEntry(phase));
      } else if (key.return) {
        const prefix = buffer.trim();
        const label = prefix ? `${prefix}-${PROVIDER_LABELS[phase.provider]}` : undefined;
        onDone(buildEntry(phase, label));
      } else if (key.backspace) {
        setBuffer(buffer.slice(0, -1));
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      } else if (!key.ctrl && input) {
        setBuffer(buffer + input);
      }
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
      {phase.type === 'select' && (
        <>
          <Text bold>Connect a provider</Text>
          <Box flexDirection="column" marginTop={1}>
            {PROVIDERS.map((p, i) => (
              <Text key={p.value}>
                {'  '}{i === cursor ? <Text bold>{'>'}</Text> : ' '} {p.label} <Text dimColor>({p.auth})</Text>
              </Text>
            ))}
          </Box>
          <Text dimColor>{'  '}↑↓ · Enter select · Esc cancel</Text>
        </>
      )}

      {phase.type === 'input' && (
        <>
          <Text bold>{credentialPrompt(phase.provider)}</Text>
          <Box marginTop={1}>
            <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
          </Box>
          <Text dimColor>{'  '}Enter confirm · Esc cancel</Text>
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
          <Text dimColor>{'  '}e.g. &quot;main&quot; → &quot;main-{PROVIDER_LABELS[phase.provider]}&quot;</Text>
          <Box marginTop={1}>
            <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
          </Box>
          <Text dimColor>{'  '}Enter confirm · Esc skip</Text>
        </>
      )}
    </Box>
  );
}
