import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';

export function setupScreen(): void {
  stdout.write('\x1b[?25l');
  if (stdin.isTTY) stdin.setRawMode(true);
}

export function cleanupScreen(): void {
  stdout.write('\x1b[?25h');
  if (stdin.isTTY) stdin.setRawMode(false);
}

export function setupInput(onRefresh: () => void): void {
  if (!stdin.isTTY) return;

  emitKeypressEvents(stdin);

  stdin.on('keypress', (_str: string, key: { name?: string; ctrl?: boolean }) => {
    if ((key.ctrl && key.name === 'c') || key.name === 'q') {
      cleanupScreen();
      stdout.write('\x1b[2J\x1b[H');
      process.exit(0);
    }
    if (key.name === 'r') {
      onRefresh();
    }
  });
}
