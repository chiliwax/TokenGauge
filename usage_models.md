# ChatGPT Usage Check — Terminal Script

## Auth Source

OpenCode stores OpenAI OAuth tokens in `~/.local/share/opencode/auth.json`:

```json
{
  "openai": {
    "type": "oauth",
    "access": "<JWT access_token>",
    "refresh": "<refresh_token>",
    "expires": 1770563557150,
    "accountId": "<uuid>",
    "idToken": "<JWT id_token>"
  }
}
```

Or as an API key:
```json
{
  "openai": {
    "type": "apiKey",
    "key": "sk-proj-..."
  }
}
```

## API Endpoints

### OAuth token → standard ChatGPT endpoint

```
GET https://chatgpt.com/backend-api/wham/usage
Authorization: Bearer <access_token>
ChatGPT-Account-Id: <accountId>
```

Response:
```json
{
  "plan_type": "pro",
  "rate_limit": {
    "primary_window": {
      "used_percent": 9,
      "reset_after_seconds": 7252
    },
    "secondary_window": {
      "used_percent": 3,
      "reset_after_seconds": 265266
    },
    "spark_primary_window": {
      "used_percent": 10,
      "limit_window_seconds": 43200,
      "reset_after_seconds": 1800
    },
    "spark_secondary_window": {
      "used_percent": 5,
      "limit_window_seconds": 2419200,
      "reset_after_seconds": 7200
    }
  },
  "additional_rate_limits": [
    {
      "limit_name": "GPT-5.3-Codex-Spark",
      "metered_feature": "codex_bengalfox",
      "rate_limit": {
        "primary_window": { "used_percent": 16, "reset_after_seconds": 16711 },
        "secondary_window": { "used_percent": 5, "reset_after_seconds": 603511 }
      }
    }
  ],
  "credits": {
    "has_credits": false,
    "unlimited": false,
    "balance": "0",
    "approx_local_messages": [0],
    "approx_cloud_messages": [0]
  }
}
```

### API key → not ChatGPT subscription usage

When OpenCode has an API key instead of OAuth, do not treat it as ChatGPT Plus/Pro quota. Normal OpenAI API keys need organization/admin usage support and are kept separate in TokenGauge.

## Claude / Anthropic Usage Check

### Auth Source

OpenCode stores Claude OAuth tokens under `anthropic` in `~/.local/share/opencode/auth.json`:

```json
{
  "anthropic": {
    "type": "oauth",
    "access": "<access_token>",
    "refresh": "<refresh_token>",
    "expires": 1770563557150
  }
}
```

Normal Anthropic API keys are not Claude subscription OAuth credentials.

### OAuth token → Claude usage endpoint

```http
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <access_token>
anthropic-beta: oauth-2025-04-20
Accept: application/json
Content-Type: application/json
```

Known response fields include `five_hour`, `seven_day`, `seven_day_oauth_apps`, `seven_day_opus`, `seven_day_sonnet`, design/routine aliases, `iguana_necktie`, and `extra_usage`. Usage windows expose `utilization` plus optional `resets_at`; `extra_usage` can expose `is_enabled`, `monthly_limit`, `used_credits`, `utilization`, and `currency`.

<!-- Historical OpenAI API sketch kept for reference:

```
GET https://api.openai.com/v1/usage
Authorization: Bearer sk-proj-...
```

Response:
```json
{
  "request_count": 321,
  "total_tokens": 654321,
  "total_cost_usd": 11.75,
  "limits": [
    {
      "limit_type": "requests",
      "limit_window": "5h",
      "max_value": 200,
      "current_value": 50,
      "remaining_value": 150,
      "model_filter": null,
      "reset_at": "2026-04-02T12:00:00Z"
    },
    {
      "limit_type": "requests",
      "limit_window": "7d",
      "max_value": 1000,
      "current_value": 300,
      "remaining_value": 700,
      "model_filter": null,
      "reset_at": "2026-04-09T12:00:00Z"
    },
    {
      "limit_type": "requests",
      "limit_window": "5h",
      "max_value": 400,
      "current_value": 40,
      "remaining_value": 360,
      "model_filter": "gpt-5.3-codex-spark",
      "reset_at": "2026-04-02T13:00:00Z"
    }
  ]
}
```
-->

## Window Resolution

1. Prefer explicit `limit_window_seconds` to determine short vs. long window
2. Fallback: `reset_after_seconds < 86400` = short (5h), `>= 86400` = long (weekly)
3. Fallback: `primary_window` / `secondary_window` naming
4. Last resort: alphabetical key ordering

## Output Format

```
ChatGPT Usage
  Plan:         Pro
  5h window:    9% used (91% remaining, resets in ~2h)
  Weekly:       3% used (97% remaining, resets in ~3d)
  Spark (5h):   10% used (resets in ~30min)
  Credits:      None
```

## Implementation

### Bash + curl + jq (~50 lines)

Reads `auth.json`, detects OAuth vs API key, calls the right endpoint, formats output.

### Node.js (~40 lines)

No extra deps (`https` module + `JSON.parse`). Can be published as an opencode plugin or standalone script.

## References

- OpenCode Bar source: https://github.com/opgginc/opencode-bar
- Main logic: `CopilotMonitor/CopilotMonitor/Providers/CodexProvider.swift`
- Auth discovery: `CopilotMonitor/CopilotMonitor/Services/TokenManager.swift`
