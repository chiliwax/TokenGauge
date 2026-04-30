import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { cleanupScreen } from './screen.js';
import type { AccountEntry } from '../config.js';

const GRAY = '\x1b[90m';
const RESET = '\x1b[39m';
const BOLD = '\x1b[1m';
const BOLD_OFF = '\x1b[22m';

interface MenuOption {
  id: string;
  label: string;
  provider: AccountEntry['provider'];
  keyPrefix?: string;
}

const OPTIONS: MenuOption[] = [
  { id: 'openai', label: 'OpenAI (API key)', provider: 'openai', keyPrefix: 'sk-' },
  { id: 'openrouter', label: 'OpenRouter', provider: 'openrouter', keyPrefix: 'sk-or-' },
  { id: 'anthropic', label: 'Anthropic', provider: 'anthropic', keyPrefix: 'sk-ant-' },
  { id: 'opencode-go', label: 'OpenCode Go (local DB)', provider: 'opencode-go' },
];

type MenuState =
  | { phase: 'select'; cursor: number }
  | { phase: 'input'; option: MenuOption; buffer: string };

export function runConnectMenu(): Promise<AccountEntry | null> {
  return new Promise((resolve) => {
    emitKeypressEvents(stdin);

    let state: MenuState = { phase: 'select', cursor: 0 };

    function render(): void {
      stdout.write('\x1b[2J\x1b[H');

      if (state.phase === 'select') {
        stdout.write(`  ${BOLD}Connect a provider${BOLD_OFF}\n\n`);
        for (let i = 0; i < OPTIONS.length; i++) {
          const cursor = i === state.cursor ? `${BOLD}>${BOLD_OFF}` : ' ';
          const gray = i !== state.cursor ? GRAY : RESET;
          stdout.write(`  ${cursor} ${gray}${OPTIONS[i].label}${RESET}\n`);
        }
        stdout.write(`\n  ${GRAY}↑↓  Enter select  Esc cancel${RESET}\n`);
      } else {
        const opt = state.option;
        stdout.write(`  ${BOLD}Enter your ${opt.label} key${BOLD_OFF}\n\n`);
        stdout.write(`  ${state.buffer}${BOLD}_${BOLD_OFF}\n`);
        stdout.write(`\n  ${GRAY}Enter confirm  Esc cancel${RESET}\n`);
      }
    }

    render();

    function cleanup(): void {
      stdin.removeListener('keypress', handler);
    }

    function handler(_str: string, key: { name?: string; ctrl?: boolean; sequence?: string }): void {
      if (state.phase === 'select') {
        if (key.name === 'up' && state.cursor > 0) {
          state = { ...state, cursor: state.cursor - 1 };
          render();
        } else if (key.name === 'down' && state.cursor < OPTIONS.length - 1) {
          state = { ...state, cursor: state.cursor + 1 };
          render();
        } else if (key.name === 'enter' || key.name === 'return') {
          const opt = OPTIONS[state.cursor];
          if (opt.provider === 'opencode-go') {
            cleanup();
            resolve({ provider: 'opencode-go', key: '' });
          } else {
            state = { phase: 'input', option: OPTIONS[state.cursor], buffer: '' };
            render();
          }
        } else if (key.name === 'escape') {
          cleanup();
          resolve(null);
        } else if ((key.ctrl && key.name === 'c') || key.name === 'q') {
          cleanup();
          cleanupScreen();
          process.exit(0);
        }
      } else {
        if (key.name === 'escape') {
          state = { phase: 'select', cursor: 0 };
          render();
        } else if (key.name === 'enter' || key.name === 'return') {
          if (state.buffer.trim()) {
            cleanup();
            resolve({
              provider: state.option.provider,
              key: state.buffer.trim(),
            });
          }
        } else if (key.name === 'backspace') {
          state = { ...state, buffer: state.buffer.slice(0, -1) };
          render();
        } else if (key.ctrl && key.name === 'c') {
          cleanup();
          cleanupScreen();
          process.exit(0);
        } else if (key.sequence && !key.ctrl) {
          state = { ...state, buffer: state.buffer + key.sequence };
          render();
        }
      }
    }

    stdin.on('keypress', handler);
  });
}
