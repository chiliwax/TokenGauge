import { Text } from 'ink';
import type { UsageSection } from '../../providers/types.js';

export function ProgressBar({ section, cw }: { section: UsageSection; cw: number }) {
  const barMax = Math.max(10, cw - 30);
  const barW = Math.min(barMax, 40);
  const filled = Math.min(barW, Math.max(0, Math.floor((section.usedPercent / 100) * barW)));
  const bar = '█'.repeat(filled) + '░'.repeat(barW - filled);

  const suffix = section.displayValue ?? (
    section.current != null && section.max != null
      ? `${section.current}/${section.max}`
      : `${section.usedPercent}%`
  );

  const resetStr = section.resetInSeconds != null
    ? ` · ${fmtReset(section.resetInSeconds)}`
    : '';

  return (
    <Text>
      {section.label.padEnd(10)} {bar} {suffix}<Text dimColor>{resetStr}</Text>
    </Text>
  );
}

function fmtReset(seconds: number): string {
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `~${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `~${Math.round(seconds / 3600)}h`;
  return `~${Math.round(seconds / 86400)}d`;
}
