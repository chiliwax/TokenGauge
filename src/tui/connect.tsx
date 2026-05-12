import { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { AccountEntry } from '../config.js';

interface ConnectPageProps {
  onDone: (result: AccountEntry | null) => void;
}

const PROVIDERS: { value: AccountEntry['provider']; label: string }[] = [
  { value: 'openai', label: 'OpenAI (API key)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'opencode', label: 'OpenCode (web cookie)' },
  { value: 'opencode-go', label: 'OpenCode Go (web cookie)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'venice', label: 'Venice' },
  { value: 'moonshot', label: 'Moonshot' },
  { value: 'crof', label: 'Crof' },
  { value: 'kimik2', label: 'Kimi K2' },
  { value: 'warp', label: 'Warp' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'synthetic', label: 'Synthetic' },
  { value: 'codebuff', label: 'Codebuff' },
  { value: 'zai', label: 'z.ai' },
  { value: 'perplexity', label: 'Perplexity (cookie)' },
  { value: 'manus', label: 'Manus (token)' },
];

const PROVIDER_LABELS: Record<AccountEntry['provider'], string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  opencode: 'OpenCode',
  'opencode-go': 'OpenCode Go',
  deepseek: 'DeepSeek',
  venice: 'Venice',
  moonshot: 'Moonshot',
  crof: 'Crof',
  kimik2: 'Kimi K2',
  warp: 'Warp',
  copilot: 'Copilot',
  synthetic: 'Synthetic',
  codebuff: 'Codebuff',
  zai: 'z.ai',
  perplexity: 'Perplexity',
  manus: 'Manus',
};

type Phase =
  | { type: 'select' }
  | { type: 'input'; provider: AccountEntry['provider'] }
  | { type: 'workspace'; provider: AccountEntry['provider']; key: string }
  | { type: 'label'; provider: AccountEntry['provider']; key: string; workspaceId?: string };

function usesCookie(provider: AccountEntry['provider']): boolean {
  return provider === 'opencode' || provider === 'opencode-go' || provider === 'perplexity';
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
                {'  '}{i === cursor ? <Text bold>{'>'}</Text> : ' '} {p.label}
              </Text>
            ))}
          </Box>
          <Text dimColor>{'  '}↑↓ · Enter select · Esc cancel</Text>
        </>
      )}

      {phase.type === 'input' && (
        <>
          <Text bold>{usesCookie(phase.provider) ? `Paste your ${PROVIDER_LABELS[phase.provider]} Cookie header or auth cookie value` : `Enter your ${PROVIDER_LABELS[phase.provider]} API key`}</Text>
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
