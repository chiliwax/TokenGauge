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

  useEffect(() => {
    const tick = setInterval(() => bump(n => n + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  const termW = stdout.columns || 80;
  const innerW = termW - 2;

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

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1} gap={0} marginTop={1}>
      <Text dimColor>{'─'.repeat(innerW)}</Text>
      <Box>
        <Text><Text color="cyan">◈</Text> <Text color="cyan" bold>TokenGauge</Text></Text>
        <Box flexGrow={1} />
        <Text dimColor>[q] quit</Text>
      </Box>
      <Text dimColor>{'─'.repeat(innerW)}</Text>

      {usages.map((usage) => (
        <Box key={usage.providerName} borderStyle="round" flexDirection="column" paddingLeft={1} paddingRight={1}>
          <Text bold>{usage.providerName}{usage.plan ? <Text dimColor> — {usage.plan}</Text> : null}</Text>

          {usage.error ? (
            <Text dimColor>Error: {usage.error}</Text>
          ) : usage.sections.length === 0 ? (
            <Text dimColor>No usage data available</Text>
          ) : (
            usage.sections.map((section, i) => (
              <ProgressBar key={i} section={section} cw={innerW - 4} />
            ))
          )}

          {usage.credits != null && (
            <Text><Text dimColor>Credits:</Text> {usage.credits}</Text>
          )}
        </Box>
      ))}

      <Text dimColor>{'─'.repeat(innerW)}</Text>

      <Box>
        <Text>Updated {timeStr}   Next in {remaining}s   </Text>
        <Box flexGrow={1} />
        <Text dimColor>[r] reload   [m] manage</Text>
      </Box>

      <Text dimColor>{'─'.repeat(innerW)}</Text>
    </Box>
  );
}
