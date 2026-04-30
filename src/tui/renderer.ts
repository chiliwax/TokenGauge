import { stdout } from 'node:process';
import type { ProviderUsage } from '../providers/types.js';

const GRAY = '\x1b[90m';
const RESET = '\x1b[39m';
const BOLD = '\x1b[1m';
const BOLD_OFF = '\x1b[22m';

function getWidth(): number {
  return Math.max(50, Math.min(stdout.columns || 80, 80));
}

function fmtReset(seconds: number): string {
  if (seconds < 60) return '<1m';
  if (seconds < 3600) return `~${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `~${Math.round(seconds / 3600)}h`;
  return `~${Math.round(seconds / 86400)}d`;
}

export function buildScreen(
  usages: ProviderUsage[],
  updatedAt: Date,
  nextRefresh: number,
): string {
  const width = getWidth();
  const cw = width - 2;
  const lines: string[] = [];

  // Header
  const ctrlHint = `${GRAY}Ctrl+C to quit${RESET}`;
  lines.push(`  ${BOLD}TokenGauge${BOLD_OFF}${' '.repeat(cw - 10 - 14)}${ctrlHint}`);

  // Separator
  lines.push(`${GRAY}  ${'─'.repeat(cw)}${RESET}`);

  // Provider content
  for (const usage of usages) {
    lines.push(`  ${BOLD}${usage.providerName}${usage.plan ? ` — ${usage.plan}` : ''}${BOLD_OFF}`);

    if (usage.error) {
      lines.push(`  ${GRAY}Error:${RESET} ${usage.error}`);
      continue;
    }

    if (usage.sections.length === 0) {
      lines.push(`  ${GRAY}No usage data available${RESET}`);
      continue;
    }

    for (const section of usage.sections) {
      const label = section.label.padEnd(12);
      const barW = 16;
      const filled = Math.min(barW, Math.max(0, Math.floor((section.usedPercent / 100) * barW)));
      const bar = '█'.repeat(filled) + '░'.repeat(barW - filled);

      const suffix = section.displayValue ?? (
        section.current != null && section.max != null
          ? `${section.current}/${section.max}`
          : `${section.usedPercent}%`
      );

      const resetStr = section.resetInSeconds != null
        ? ` ${GRAY}·${RESET} ${fmtReset(section.resetInSeconds)}`
        : '';

      lines.push(`    ${label} ${bar}  ${suffix}${resetStr}`);
    }

    if (usage.credits != null) {
      lines.push(`  ${GRAY}Credits:${RESET} ${usage.credits}`);
    }
  }

  // Footer separator
  lines.push(`${GRAY}  ${'─'.repeat(cw)}${RESET}`);

  // Footer
  const timeStr = updatedAt.toLocaleTimeString();
  const refreshStr = `Next in ${nextRefresh}s`;
  const reloadStr = `${GRAY}[r] reload${RESET}`;
  lines.push(`  Updated ${timeStr}   ${refreshStr}   ${reloadStr}`);

  // Bottom separator
  lines.push(`${GRAY}  ${'─'.repeat(cw)}${RESET}`);

  return lines.join('\n');
}
