import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import type { ProviderUsage } from '../providers/types.js';
import { ProgressBar } from './components/progress-bar.js';

interface DashboardProps {
  usages: ProviderUsage[];
  lastFetchTime: number;
  refreshSeconds: number;
  onManage: () => void;
  onRefresh: () => void;
}

export function Dashboard({ usages, lastFetchTime, refreshSeconds, onManage, onRefresh }: DashboardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [, bump] = useState(0);

  useEffect(() => {
    const onResize = () => bump(n => n + 1);
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  const cw = (stdout.columns ?? 80) - 4;

  useInput((input, key) => {
    if ((key.ctrl && input === 'c') || input === 'q') {
      exit();
    }
    if (input === 'r') {
      onRefresh();
    }
    if (input === 'm') {
      onManage();
    }
  });

  const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);
  const remaining = Math.max(0, refreshSeconds - elapsed);
  const timeStr = new Date(lastFetchTime).toLocaleTimeString();

  function Sep() {
    return <Text dimColor>{'─'.repeat(cw)}</Text>;
  }

  function SepWithHint(hint: string) {
    const hintStr = ` ${hint} `;
    const leftDashes = Math.min(4, cw - hintStr.length - 4);
    const rightDashes = cw - leftDashes - hintStr.length;
    return (
      <Text dimColor>{'─'.repeat(leftDashes)}{hintStr}{'─'.repeat(Math.max(0, rightDashes))}</Text>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Text>{'✦ '}<Text bold>TokenGauge</Text></Text>

      {SepWithHint('[q] / Ctrl+C to quit')}

      {usages.map((usage) => (
        <Box key={usage.providerName} flexDirection="column">
          <Text><Text bold>{usage.providerName}</Text>{usage.plan ? <Text dimColor> — {usage.plan}</Text> : null}</Text>

          {usage.error ? (
            <Text><Text dimColor>Error:</Text> {usage.error}</Text>
          ) : usage.sections.length === 0 ? (
            <Text dimColor>No usage data available</Text>
          ) : (
            usage.sections.map((section, i) => (
              <ProgressBar key={i} section={section} cw={cw} />
            ))
          )}

          {usage.credits != null && (
            <Text><Text dimColor>Credits:</Text> {usage.credits}</Text>
          )}
        </Box>
      ))}

      <Sep />

      <Box>
        <Text>Updated {timeStr}   Next in {remaining}s   </Text>
        <Text dimColor>[r] reload   [m] manage providers</Text>
      </Box>

      <Sep />
    </Box>
  );
}
