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
  { value: 'opencode-go', label: 'OpenCode Go (local DB)' },
];

const PROVIDER_LABELS: Record<AccountEntry['provider'], string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  'opencode-go': 'OpenCode Go',
};

type Phase =
  | { type: 'select' }
  | { type: 'input'; provider: AccountEntry['provider'] }
  | { type: 'label'; provider: AccountEntry['provider']; key: string };

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
        if (provider === 'opencode-go') {
          setPhase({ type: 'label', provider, key: 'local' });
        } else {
          setPhase({ type: 'input', provider });
        }
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
        setPhase({ type: 'label', provider: phase.provider, key: buffer.trim() });
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
        const entry: AccountEntry = phase.provider === 'opencode-go'
          ? { provider: 'opencode-go', key: 'local' }
          : { provider: phase.provider, key: phase.key };
        onDone(entry);
      } else if (key.return) {
        const prefix = buffer.trim();
        const label = prefix ? `${prefix}-${PROVIDER_LABELS[phase.provider]}` : undefined;
        const entry: AccountEntry = phase.provider === 'opencode-go'
          ? { provider: 'opencode-go', key: 'local', label }
          : { provider: phase.provider, key: phase.key, label };
        onDone(entry);
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
          <Text bold>Enter your {PROVIDER_LABELS[phase.provider]} API key</Text>
          <Box marginTop={1}>
            <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
          </Box>
          <Text dimColor>{'  '}Enter confirm · Esc cancel</Text>
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
