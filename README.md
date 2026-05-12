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
```
 ──────────────────────────────────────────────────────────────────────────
 ◈ TokenGauge                                                      [q] quit
 ──────────────────────────────────────────────────────────────────────────
 ╭────────────────────────────────────────────────────────────────────────╮
 │ OpenRouter — $0.79 remaining                                           │
 │ Used       ██████████████████████████████████████░░ 9.21/10            │
 ╰────────────────────────────────────────────────────────────────────────╯
 ╭────────────────────────────────────────────────────────────────────────╮
 │ OpenAI — prolite                                                       │
 │ 5h window  █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 3% · ~19min        │
 │ Weekly     ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 8% · ~1d           │
 │ GPT-5.3-Codex-Spark ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0% · ~5h  │
 │ Credits: None                                                          │
 ╰────────────────────────────────────────────────────────────────────────╯
 ╭────────────────────────────────────────────────────────────────────────╮
 │ OpenCode Go                                                            │
 │ 5h window  ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 17% · ~5h          │
 │ Weekly     ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 7% · ~6d           │
 │ Monthly    ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 9% · ~15d          │
 ╰────────────────────────────────────────────────────────────────────────╯
 ──────────────────────────────────────────────────────────────────────────
 Updated 12:57:30 PM   Next in 18s                  [r] reload   [m] manage
 ──────────────────────────────────────────────────────────────────────────
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

### OpenCode

Configure `OpenCode (web cookie)` from the manage screen, or set `OPENCODE_COOKIE` to a `Cookie:` header from `opencode.ai`. Optional workspace override: `OPENCODE_WORKSPACE_ID` or `CODEXBAR_OPENCODE_WORKSPACE_ID`.

### OpenCode Go

Configure `OpenCode Go (web cookie)` from the manage screen, or set `OPENCODE_GO_COOKIE`. If unset, it falls back to `OPENCODE_COOKIE`. Optional workspace override: `OPENCODE_GO_WORKSPACE_ID` or `CODEXBAR_OPENCODEGO_WORKSPACE_ID`.

### DeepSeek

Configure `DeepSeek` from the manage screen with your API key, or set `DEEPSEEK_API_KEY`.

### Venice

Configure `Venice` from the manage screen with your API key, or set `VENICE_API_KEY`.

### Moonshot

Configure `Moonshot` from the manage screen with your API key, or set `MOONSHOT_API_KEY`.

### Crof

Configure `Crof` from the manage screen with your API key, or set `CROF_API_KEY`.

### Kimi K2

Configure `Kimi K2` from the manage screen with your API key, or set `KIMIK2_API_KEY`.

### Warp

Configure `Warp` from the manage screen with your API key, or set `WARP_API_KEY`.

### Copilot

Configure `Copilot` from the manage screen with your GitHub token, or set `COPILOT_TOKEN`.

### Synthetic

Configure `Synthetic` from the manage screen with your API key, or set `SYNTHETIC_API_KEY`.

### Codebuff

Configure `Codebuff` from the manage screen with your API key, or set `CODEBUFF_API_KEY`. Optional base URL override: `CODEBUFF_API_URL`.

### z.ai

Configure `z.ai` from the manage screen with your API key, or set `ZAI_API_KEY`. Optional host override: `Z_AI_API_HOST`.

### Perplexity

Configure `Perplexity` from the manage screen with your session cookie, or set `PERPLEXITY_COOKIE`. Copy the Cookie header from your browser when signed in to perplexity.ai.

### Manus

Configure `Manus` from the manage screen with your session token, or set `MANUS_TOKEN`. Use the Authorization Bearer token from your browser's network requests to manus.im.

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
