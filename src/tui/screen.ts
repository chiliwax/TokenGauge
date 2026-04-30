import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';

export function setupScreen(): void {
  stdout.write('\x1b[?1049h\x1b[?25l');
  if (stdin.isTTY) stdin.setRawMode(true);
}

export function cleanupScreen(): void {
  stdout.write('\x1b[?25h\x1b[?1049l');
  if (stdin.isTTY) stdin.setRawMode(false);
}

export function setupInput(onRefresh: () => void, onManage?: () => void): () => void {
  if (!stdin.isTTY) return () => {};

  emitKeypressEvents(stdin);

  const handler = (_str: string, key: { name?: string; ctrl?: boolean }) => {
    if ((key.ctrl && key.name === 'c') || key.name === 'q') {
      cleanupScreen();
      process.exit(0);
    }
    if (key.name === 'r') {
      onRefresh();
    }
    if (key.name === 'm' && !key.ctrl && onManage) {
      onManage();
    }
  };

  stdin.on('keypress', handler);
  return () => stdin.removeListener('keypress', handler);
}
