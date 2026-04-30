# TokenGauge

TUI dashboard for AI provider token usage — live progress bars in your terminal.

```
  TokenGauge                                                     Ctrl+C to quit
  ──────────────────────────────────────────────────────────────────────────────
  OpenAI — Pro
    5h window    ████████████████░░  80% · ~2h
    Weekly       ████░░░░░░░░░░░░░░  25% · ~6d
    Credits: None
  ──────────────────────────────────────────────────────────────────────────────
  Updated 12:51:02 PM   Next in 24s   [r] reload
  ──────────────────────────────────────────────────────────────────────────────
```

## Usage

```sh
npx tsx src/index.ts
```

### Options

| Argument | Description |
|---|---|
| `--auth-path` / `-p` | Custom path to OpenCode `auth.json` |
| `--anthropic-key` | Anthropic API key (or `ANTHROPIC_API_KEY` env) |

### Keys

| Key | Action |
|---|---|
| `q` / `Ctrl+C` | Quit |
| `r` | Refresh now |

## Providers

### OpenAI (OAuth)

Auto-detected from `~/.local/share/opencode/auth.json`. Supports both OAuth tokens and API keys.

### OpenAI (API key)

If `auth.json` has an `apiKey` entry, or if you manually configure one, TokenGauge calls the self-service usage API.

### Anthropic

Pass `--anthropic-key <key>` or set `ANTHROPIC_API_KEY`. Anthropic doesn't currently expose a usage API — shows a placeholder until they ship one.

### Adding a new provider

Implement the `Provider` interface in `src/providers/types.ts`:

```ts
interface Provider {
  readonly id: string;
  readonly displayName: string;
  fetchUsage(): Promise<ProviderUsage>;
}
```

Register it in `src/index.ts` and it renders alongside the rest.

## No dependencies

Uses only Node built-ins (`https`, `fs`, `os`, `readline`, `process`). Dev toolchain: `tsx`, `typescript`.
