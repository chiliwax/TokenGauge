import { Text } from 'ink';
import type { UsageSection } from '../../providers/types.js';

export function ProgressBar({ section, cw }: { section: UsageSection; cw: number }) {
  const barMax = Math.max(10, cw - 30);
  const barW = Math.min(barMax, 40);
  const pct = section.usedPercent;
  const filled = Math.min(barW, Math.max(0, Math.floor((pct / 100) * barW)));
  const unfilled = barW - filled;

  const color = pct >= 80 ? '#e06c75' : pct >= 50 ? '#f0c674' : '#7dd87d';

  const suffix = section.displayValue ?? (
    section.current != null && section.max != null
      ? `${section.current}/${section.max}`
      : `${pct}%`
  );

  const resetStr = section.resetInSeconds != null
    ? ` · ${fmtReset(section.resetInSeconds)}`
    : '';

  return (
    <Text>
      {section.label.padEnd(10)}{' '}
      {filled > 0 && <Text bold color={color}>{'━'.repeat(filled)}</Text>}
      <Text bold dimColor>{'─'.repeat(unfilled)}</Text>{' '}
      {suffix}
      <Text dimColor>{resetStr}</Text>
    </Text>
  );
}

function fmtReset(seconds: number): string {
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `~${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `~${Math.round(seconds / 3600)}h`;
  return `~${Math.round(seconds / 86400)}d`;
}
