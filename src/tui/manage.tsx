import { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { loadCredentials, saveAccount, deleteAccount, updateAccount, detectFromOpenCode } from '../config.js';
import type { AccountEntry } from '../config.js';
import { ConnectPage } from './connect.js';

interface ManagePageProps {
  onDone: (modified: boolean) => void;
}

type SubPage =
  | { type: 'list' }
  | { type: 'detail'; index: number }
  | { type: 'edit'; index: number }
  | { type: 'delete'; index: number }
  | { type: 'import' }
  | { type: 'import-prefix' }
  | { type: 'connect' };

function fmtLabel(entry: AccountEntry, i: number): string {
  return entry.label || `${entry.provider.charAt(0).toUpperCase() + entry.provider.slice(1)} #${i + 1}`;
}

function keyPreview(key: string): string {
  if (key.length <= 12) return key;
  return key.slice(0, 8) + '...' + key.slice(-4);
}

export function ManagePage({ onDone }: ManagePageProps) {
  const { exit } = useApp();
  const [subPage, setSubPage] = useState<SubPage>({ type: 'list' });
  const [cursor, setCursor] = useState(0);
  const [buffer, setBuffer] = useState('');
  const [modified, setModified] = useState(false);
  const [accounts, setAccounts] = useState(() => loadCredentials());
  const [importSelection, setImportSelection] = useState<Set<number>>(new Set());
  const [importDetected, setImportDetected] = useState<AccountEntry[]>([]);

  const reload = () => setAccounts(loadCredentials());

  if (subPage.type === 'connect') {
    return (
      <ConnectPage
        onDone={(result) => {
          if (result) {
            saveAccount(result);
            reload();
            setModified(true);
          }
          setSubPage({ type: 'list' });
        }}
      />
    );
  }

  useInput((input, key) => {
    if (subPage.type === 'list') {
      const items: { type: string }[] = [];
      for (let i = 0; i < accounts.length; i++) items.push({ type: 'account' });
      items.push({ type: 'add' }, { type: 'import' }, { type: 'done' });

      if (key.upArrow && cursor > 0) {
        setCursor(cursor - 1);
      } else if (key.downArrow && cursor < items.length - 1) {
        setCursor(cursor + 1);
      } else if (key.return) {
        const type = items[cursor].type;
        if (type === 'account') {
          setSubPage({ type: 'detail', index: cursor });
        } else if (type === 'add') {
          setSubPage({ type: 'connect' });
        } else if (type === 'import') {
          const detected = detectFromOpenCode();
          const existingKeys = new Set(loadCredentials().map((e) => e.key));
          const filtered = detected.filter((d) => !existingKeys.has(d.key));
          setImportDetected(filtered);
          setImportSelection(new Set());
          setCursor(0);
          setSubPage({ type: 'import' });
        } else if (type === 'done') {
          onDone(modified);
        }
      } else if (key.escape) {
        onDone(modified);
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      }
    } else if (subPage.type === 'detail') {
      const index = subPage.index;
      if (input === 'e') {
        setBuffer(accounts[index].label || '');
        setSubPage({ type: 'edit', index });
      } else if (input === 'd') {
        setSubPage({ type: 'delete', index });
      } else if (key.escape) {
        setSubPage({ type: 'list' });
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      }
    } else if (subPage.type === 'delete') {
      const index = subPage.index;
      if (input === 'y') {
        deleteAccount(index);
        reload();
        setModified(true);
        setSubPage({ type: 'list' });
      } else if (input === 'n' || key.escape) {
        setSubPage({ type: 'detail', index });
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      }
    } else if (subPage.type === 'edit') {
      const index = subPage.index;
      if (key.return) {
        updateAccount(index, { label: buffer.trim() || undefined });
        reload();
        setModified(true);
        setSubPage({ type: 'detail', index });
      } else if (key.escape) {
        setSubPage({ type: 'detail', index });
      } else if (key.backspace) {
        setBuffer(buffer.slice(0, -1));
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      } else if (!key.ctrl && input) {
        setBuffer(buffer + input);
      }
    } else if (subPage.type === 'import') {
      if (key.escape) {
        setSubPage({ type: 'list' });
        setCursor(0);
      } else if (key.upArrow && cursor > 0) {
        setCursor(cursor - 1);
      } else if (key.downArrow && cursor < importDetected.length - 1) {
        setCursor(cursor + 1);
      } else if (input === ' ') {
        const next = new Set(importSelection);
        if (next.has(cursor)) next.delete(cursor);
        else next.add(cursor);
        setImportSelection(next);
      } else if (key.return) {
        if (importSelection.size > 0) {
          setBuffer('');
          setSubPage({ type: 'import-prefix' });
        }
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      }
    } else if (subPage.type === 'import-prefix') {
      if (key.return) {
        const prefix = buffer.trim();
        for (const idx of importSelection) {
          const entry = { ...importDetected[idx] };
          if (prefix) {
            entry.label = `${prefix}-OpenAI`;
          }
          saveAccount(entry);
        }
        reload();
        setModified(true);
        setSubPage({ type: 'list' });
        setCursor(0);
      } else if (key.escape) {
        for (const idx of importSelection) {
          saveAccount(importDetected[idx]);
        }
        reload();
        setModified(true);
        setSubPage({ type: 'list' });
        setCursor(0);
      } else if (key.backspace) {
        setBuffer(buffer.slice(0, -1));
      } else if ((key.ctrl && input === 'c') || input === 'q') {
        exit();
      } else if (!key.ctrl && input) {
        setBuffer(buffer + input);
      }
    }
  });

  const renderList = () => {
    const items: { type: string; label: string }[] = [];
    for (let i = 0; i < accounts.length; i++) {
      items.push({ type: 'account', label: fmtLabel(accounts[i], i) });
    }
    items.push(
      { type: 'add', label: '+ Add provider' },
      { type: 'import', label: 'Import from OpenCode auth.json' },
      { type: 'done', label: 'Done (back to dashboard)' },
    );

    return (
      <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
        <Text bold>Manage providers</Text>
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          {accounts.length === 0 && <Text dimColor>{'  '}No accounts configured.</Text>}
          {items.map((item, i) => {
            const cur = i === cursor ? '>' : ' ';
            if (item.type === 'add') {
              return <Text key={i}>{'  '}{i === cursor ? <Text bold>{'>'}</Text> : ' '} <Text bold>{item.label}</Text></Text>;
            }
            if (item.type === 'import' || item.type === 'done') {
              return <Text key={i} dimColor>{'  '}{cur} {item.label}</Text>;
            }
            return <Text key={i}>{'  '}{cur} {item.label}</Text>;
          })}
        </Box>
        <Text dimColor>{'  '}↑↓ · Enter select · Esc back</Text>
      </Box>
    );
  };

  const renderDetail = () => {
    const entry = accounts[subPage.type === 'detail' ? subPage.index : 0];
    const provider = entry.provider.charAt(0).toUpperCase() + entry.provider.slice(1);

    return (
      <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
        <Text bold>{fmtLabel(entry, subPage.type === 'detail' ? subPage.index : 0)}</Text>
        <Text dimColor>{'  '}{'─'.repeat(40)}</Text>
        <Text>{'  '}Provider:  {provider}</Text>
        <Text>{'  '}Key:       {keyPreview(entry.key)}</Text>
        <Text>{'  '}Type:      {entry.type === 'oauth' ? 'OAuth' : 'API key'}</Text>
        <Box marginTop={1}>
          <Text>{'  '}<Text bold>[e]</Text> Edit label  <Text bold>[d]</Text> Remove  <Text dimColor>[Esc] back</Text></Text>
        </Box>
      </Box>
    );
  };

  const renderDelete = () => {
    const entry = accounts[subPage.type === 'delete' ? subPage.index : 0];
    return (
      <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
        <Text>Remove <Text bold>&quot;{fmtLabel(entry, subPage.type === 'delete' ? subPage.index : 0)}&quot;</Text>?</Text>
        <Box marginTop={1}>
          <Text>{'  '}<Text bold>[y]</Text> Yes  <Text bold>[n]</Text> No  <Text dimColor>[Esc] cancel</Text></Text>
        </Box>
      </Box>
    );
  };

  const renderEdit = () => {
    const entry = accounts[subPage.type === 'edit' ? subPage.index : 0];
    return (
      <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
        <Text>Edit label for <Text bold>{fmtLabel(entry, subPage.type === 'edit' ? subPage.index : 0)}</Text></Text>
        <Box marginTop={1}>
          <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
        </Box>
        <Text dimColor>{'  '}Enter confirm · Esc cancel</Text>
      </Box>
    );
  };

  const renderImport = () => {
    if (importDetected.length === 0) {
      return (
        <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
          <Text bold>Import from OpenCode auth.json</Text>
          <Text dimColor>{'  '}No accounts detected.</Text>
          <Text dimColor>{'  '}[Esc] back</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
        <Text bold>Import from OpenCode auth.json</Text>
        <Box flexDirection="column" marginTop={1}>
          {importDetected.map((d, i) => {
            const label = d.provider.charAt(0).toUpperCase() + d.provider.slice(1);
            const display = d.type === 'oauth' ? `${label} (OAuth)` : label;
            const checked = importSelection.has(i) ? '[✓]' : '[ ]';
            const cur = i === cursor ? <Text bold>{'>'}</Text> : ' ';
            return (
              <Text key={i}>
                {'  '}{cur} {checked}  {display}
              </Text>
            );
          })}
        </Box>
        <Text dimColor>{'  '}[Space] toggle · [Enter] import · [Esc] back</Text>
      </Box>
    );
  };

  const renderImportPrefix = () => {
    return (
      <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
        <Text bold>Import from OpenCode auth.json</Text>
        <Text dimColor>{'  '}Account name prefix (optional, e.g. &quot;main&quot; → &quot;main-OpenAI&quot;)</Text>
        <Box marginTop={1}>
          <Text>{'  '}{buffer}<Text bold>{'_'}</Text></Text>
        </Box>
        <Text dimColor>{'  '}Enter confirm · Esc skip</Text>
      </Box>
    );
  };

  switch (subPage.type) {
    case 'list': return renderList();
    case 'detail': return renderDetail();
    case 'delete': return renderDelete();
    case 'edit': return renderEdit();
    case 'import': return renderImport();
    case 'import-prefix': return renderImportPrefix();
    default: return null;
  }
}
