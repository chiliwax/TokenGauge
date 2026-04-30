import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { loadCredentials, saveAccount, deleteAccount, updateAccount, detectFromOpenCode } from '../config.js';
import type { AccountEntry } from '../config.js';
import { cleanupScreen } from './screen.js';
import { runConnectMenu } from './connect.js';

const GRAY = '\x1b[90m';
const RESET = '\x1b[39m';
const BOLD = '\x1b[1m';
const BOLD_OFF = '\x1b[22m';

type Page = 'list' | 'detail' | 'delete-confirm' | 'edit-label' | 'import';

function fmtAge(entry: AccountEntry): string {
  return entry.label ? ` · ${entry.label}` : '';
}

function labelOf(entry: AccountEntry, i: number): string {
  return entry.label || `${entry.provider.charAt(0).toUpperCase() + entry.provider.slice(1)} #${i + 1}`;
}

function keyPreview(key: string): string {
  if (key.length <= 12) return key;
  return key.slice(0, 8) + '...' + key.slice(-4);
}

export function runManageMenu(authPath?: string): Promise<boolean> {
  return new Promise((resolve) => {
    emitKeypressEvents(stdin);

    let page: Page = 'list';
    let cursor = 0;
    let accounts = loadCredentials();
    let editIndex = 0;
    let editBuffer = '';
    let deleteIndex = 0;
    let importDetected: AccountEntry[] = [];
    let importSelected = new Set<number>();
    let modified = false;

    function listItems(): { type: 'account' | 'add' | 'import'; label: string }[] {
      const items: { type: 'account' | 'add' | 'import'; label: string }[] = [];
      for (let i = 0; i < accounts.length; i++) {
        items.push({ type: 'account', label: labelOf(accounts[i], i) });
      }
      items.push({ type: 'add', label: '+ Add provider' });
      items.push({ type: 'import', label: 'Import from OpenCode auth.json' });
      return items;
    }

    function render(): void {
      stdout.write('\x1b[2J\x1b[H');

      if (page === 'list') {
        const items = listItems();
        stdout.write(`  ${BOLD}Manage providers${BOLD_OFF}\n\n`);
        if (accounts.length === 0) {
          stdout.write(`  ${GRAY}No accounts configured.${RESET}\n\n`);
        }
        for (let i = 0; i < items.length; i++) {
          const cur = i === cursor ? '>' : ' ';
          const isAdd = items[i].type === 'add';
          const isImport = items[i].type === 'import';
          if (isAdd) {
            stdout.write(`  ${cur} ${BOLD}${items[i].label}${BOLD_OFF}\n`);
          } else if (isImport) {
            stdout.write(`  ${cur} ${GRAY}${items[i].label}${RESET}\n`);
          } else {
            stdout.write(`  ${cur} ${items[i].label}\n`);
          }
        }
        stdout.write(`\n  ${GRAY}↑↓ · Enter select · Esc back${RESET}\n`);

      } else if (page === 'detail') {
        const e = accounts[editIndex];
        const provider = e.provider.charAt(0).toUpperCase() + e.provider.slice(1);
        stdout.write(`  ${BOLD}${labelOf(e, editIndex)}${BOLD_OFF}\n`);
        stdout.write(`  ${GRAY}${'─'.repeat(40)}${RESET}\n`);
        stdout.write(`  Provider:  ${provider}\n`);
        stdout.write(`  Key:       ${keyPreview(e.key)}\n`);
        stdout.write(`  Type:      ${e.type === 'oauth' ? 'OAuth' : 'API key'}\n`);
        stdout.write(`\n`);
        stdout.write(`  ${BOLD}[e]${BOLD_OFF} Edit label  ${BOLD}[d]${BOLD_OFF} Remove  ${GRAY}[Esc] back${RESET}\n`);

      } else if (page === 'delete-confirm') {
        const e = accounts[deleteIndex];
        stdout.write(`  Remove ${BOLD}"${labelOf(e, deleteIndex)}"${BOLD_OFF}?\n\n`);
        stdout.write(`  ${BOLD}[y]${BOLD_OFF} Yes  ${BOLD}[n]${BOLD_OFF} No  ${GRAY}[Esc] cancel${RESET}\n`);

      } else if (page === 'edit-label') {
        const e = accounts[editIndex];
        stdout.write(`  Edit label for ${BOLD}${labelOf(e, editIndex)}${BOLD_OFF}\n\n`);
        stdout.write(`  ${editBuffer}${BOLD}_${BOLD_OFF}\n`);
        stdout.write(`\n  ${GRAY}Enter confirm · Esc cancel${RESET}\n`);

      } else if (page === 'import') {
        stdout.write(`  ${BOLD}Import from OpenCode auth.json${BOLD_OFF}\n\n`);
        if (importDetected.length === 0) {
          stdout.write(`  ${GRAY}No accounts detected.${RESET}\n\n`);
          stdout.write(`  ${GRAY}[Esc] back${RESET}\n`);
        } else {
          for (let i = 0; i < importDetected.length; i++) {
            const d = importDetected[i];
            const checked = importSelected.has(i) ? '[✓]' : '[ ]';
            const provider = d.provider.charAt(0).toUpperCase() + d.provider.slice(1);
            const label = d.type === 'oauth' ? `${provider} (OAuth)` : provider;
            stdout.write(`  ${checked}  ${label}\n`);
          }
          stdout.write(`\n  ${GRAY}[Space] toggle · [Enter] import · [Esc] back${RESET}\n`);
        }
      }
    }

    render();

    function cleanup(): void {
      stdin.removeListener('keypress', handler);
    }

    function handler(_str: string, key: { name?: string; ctrl?: boolean; sequence?: string }): void {
      if (page === 'list') {
        const items = listItems();
        if (key.name === 'up' && cursor > 0) { cursor--; render(); }
        else if (key.name === 'down' && cursor < items.length - 1) { cursor++; render(); }
        else if (key.name === 'enter' || key.name === 'return') {
          const item = items[cursor];
          if (item.type === 'account') {
            editIndex = cursor;
            page = 'detail';
            render();
          } else if (item.type === 'add') {
            cleanup();
            runConnectMenu().then((result) => {
              if (result) {
                saveAccount(result);
                accounts = loadCredentials();
                modified = true;
              }
              startListening();
              page = 'list';
              cursor = 0;
              render();
            });
          } else if (item.type === 'import') {
            importDetected = detectFromOpenCode(authPath);
            importSelected = new Set();
            page = 'import';
            cursor = 0;
            render();
          }
        } else if (key.name === 'escape' || (key.ctrl && key.name === 'c') || key.name === 'q') {
          cleanup();
          if ((key.ctrl && key.name === 'c') || key.name === 'q') {
            cleanupScreen();
            process.exit(0);
          }
          resolve(modified);
        }

      } else if (page === 'detail') {
        if (key.name === 'e') {
          editBuffer = accounts[editIndex].label || '';
          page = 'edit-label';
          render();
        } else if (key.name === 'd') {
          deleteIndex = editIndex;
          page = 'delete-confirm';
          render();
        } else if (key.name === 'escape' || (key.ctrl && key.name === 'c') || key.name === 'q') {
          if ((key.ctrl && key.name === 'c') || key.name === 'q') {
            cleanup();
            cleanupScreen();
            process.exit(0);
          }
          page = 'list';
          cursor = editIndex;
          render();
        }

      } else if (page === 'delete-confirm') {
        if (key.name === 'y') {
          const e = accounts[deleteIndex];
          deleteAccount(deleteIndex);
          accounts = loadCredentials();
          modified = true;
          page = 'list';
          cursor = Math.min(cursor, listItems().length - 1);
          render();
        } else if (key.name === 'n' || key.name === 'escape') {
          page = 'detail';
          render();
        } else if ((key.ctrl && key.name === 'c') || key.name === 'q') {
          cleanup();
          cleanupScreen();
          process.exit(0);
        }

      } else if (page === 'edit-label') {
        if (key.name === 'enter' || key.name === 'return') {
          const label = editBuffer.trim() || undefined;
          updateAccount(editIndex, { label });
          accounts = loadCredentials();
          modified = true;
          page = 'detail';
          render();
        } else if (key.name === 'escape') {
          page = 'detail';
          render();
        } else if (key.name === 'backspace') {
          editBuffer = editBuffer.slice(0, -1);
          render();
        } else if ((key.ctrl && key.name === 'c') || key.name === 'q') {
          cleanup();
          cleanupScreen();
          process.exit(0);
        } else if (key.sequence && !key.ctrl) {
          editBuffer += key.sequence;
          render();
        }

      } else if (page === 'import') {
        if (key.name === 'escape') {
          page = 'list';
          cursor = 0;
          render();
        } else if (key.name === 'space' && importDetected.length > 0 && cursor < importDetected.length) {
            const idx = cursor;
            if (importSelected.has(idx)) importSelected.delete(idx);
            else importSelected.add(idx);
            render();
        } else if (key.name === 'enter' || key.name === 'return') {
          for (const idx of importSelected) {
            saveAccount(importDetected[idx]);
          }
          accounts = loadCredentials();
          modified = importSelected.size > 0;
          page = 'list';
          cursor = 0;
          render();
        } else if ((key.ctrl && key.name === 'c') || key.name === 'q') {
          cleanup();
          cleanupScreen();
          process.exit(0);
        } else if (key.name === 'up' && importDetected.length > 0 && cursor > 0) {
          cursor--;
          render();
        } else if (key.name === 'down' && importDetected.length > 0 && cursor < importDetected.length - 1) {
          cursor++;
          render();
        }
      }
    }

    function startListening() {
      stdin.on('keypress', handler);
    }

    stdin.on('keypress', handler);
  });
}
