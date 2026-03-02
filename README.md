<p align="center">
  <img src="logo.svg" alt="mcp-gads" height="52" />
</p>

<p align="center">
  Google Ads MCP server — query campaigns, keywords, assets & more via natural language.
  <br/>
  Built with Bun + TypeScript. Works with Claude, Cursor, and any MCP client.
</p>

---

## Quick Start

### 1. Get Credentials

You need a [Google Ads API developer token](https://developers.google.com/google-ads/api/docs/get-started/dev-token) and OAuth client credentials.

1. Download your OAuth client JSON from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Set environment variables:

```bash
export GOOGLE_ADS_DEVELOPER_TOKEN=your-token
export GOOGLE_ADS_CREDENTIALS_PATH=./credentials.json
```

3. Run the setup helper to authorize:

```bash
npx mcp-gads setup
```

This opens your browser, completes OAuth, and saves a refresh token.

### 2. Add to Claude Code

```bash
claude mcp add --scope user --transport stdio \
  -e GOOGLE_ADS_DEVELOPER_TOKEN=your-token \
  -e GOOGLE_ADS_CREDENTIALS_PATH=/path/to/credentials.json \
  google-ads -- npx -y mcp-gads@latest
```

That's it. Restart Claude Code and the tools are available. Every session runs the latest version automatically.

> Also works with `bunx mcp-gads@latest` if you have [Bun](https://bun.sh/).

<details>
<summary>Alternative: standalone binary</summary>

Download a pre-built binary from [Releases](https://github.com/pijusz/mcp-gads/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `mcp-gads-darwin-arm64` |
| macOS (Intel) | `mcp-gads-darwin-x64` |
| Linux | `mcp-gads-linux-x64` |
| Windows | `mcp-gads-windows-x64.exe` |

**macOS / Linux:**

```bash
curl -Lo mcp-gads https://github.com/pijusz/mcp-gads/releases/latest/download/mcp-gads-darwin-arm64
chmod +x mcp-gads
sudo mv mcp-gads /usr/local/bin/
claude mcp add --scope user --transport stdio \
  -e GOOGLE_ADS_DEVELOPER_TOKEN=your-token \
  -e GOOGLE_ADS_CREDENTIALS_PATH=/path/to/credentials.json \
  google-ads -- /usr/local/bin/mcp-gads
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri "https://github.com/pijusz/mcp-gads/releases/latest/download/mcp-gads-windows-x64.exe" -OutFile "$env:LOCALAPPDATA\mcp-gads.exe"
claude mcp add --scope user --transport stdio -e GOOGLE_ADS_DEVELOPER_TOKEN=your-token -e GOOGLE_ADS_CREDENTIALS_PATH=C:\path\to\credentials.json google-ads -- "%LOCALAPPDATA%\mcp-gads.exe"
```

</details>

### Claude Desktop

Add to your `claude_desktop_config.json`:

<details>
<summary>Using npx (auto-updates)</summary>

```json
{
  "mcpServers": {
    "google-ads": {
      "command": "npx",
      "args": ["-y", "mcp-gads@latest"],
      "env": {
        "GOOGLE_ADS_DEVELOPER_TOKEN": "your-token",
        "GOOGLE_ADS_CREDENTIALS_PATH": "/path/to/credentials.json"
      }
    }
  }
}
```

</details>

<details>
<summary>Using binary (macOS / Linux)</summary>

```json
{
  "mcpServers": {
    "google-ads": {
      "command": "/usr/local/bin/mcp-gads",
      "env": {
        "GOOGLE_ADS_DEVELOPER_TOKEN": "your-token",
        "GOOGLE_ADS_CREDENTIALS_PATH": "/path/to/credentials.json"
      }
    }
  }
}
```

</details>

<details>
<summary>Using binary (Windows)</summary>

```json
{
  "mcpServers": {
    "google-ads": {
      "command": "%LOCALAPPDATA%\\mcp-gads.exe",
      "env": {
        "GOOGLE_ADS_DEVELOPER_TOKEN": "your-token",
        "GOOGLE_ADS_CREDENTIALS_PATH": "C:\\path\\to\\credentials.json"
      }
    }
  }
}
```

</details>

## Tools (27)

### Account Management
| Tool | Description |
|------|-------------|
| `list_accounts` | List all accessible Google Ads accounts |
| `get_account_currency` | Get the currency code for an account |
| `get_account_hierarchy` | Get MCC account tree (manager -> client) |

### Queries
| Tool | Description |
|------|-------------|
| `execute_gaql_query` | Run any GAQL query (table output) |
| `run_gaql` | Run GAQL with format options (table/json/csv) |
| `list_resources` | List valid GAQL FROM clause resources |

### Campaigns
| Tool | Description |
|------|-------------|
| `get_campaign_performance` | Campaign metrics (impressions, clicks, cost, conversions) |
| `get_budget_utilization` | Budget amounts vs actual spend |

### Ads
| Tool | Description |
|------|-------------|
| `get_ad_performance` | Ad-level performance metrics |
| `get_ad_creatives` | RSA headlines, descriptions, final URLs |

### Assets
| Tool | Description |
|------|-------------|
| `get_image_assets` | List image assets with URLs and dimensions |
| `download_image_asset` | Download a specific image asset to disk |
| `get_asset_usage` | Find where assets are used (campaigns, ad groups) |
| `analyze_image_assets` | Image asset performance with metrics |

### Keywords
| Tool | Description |
|------|-------------|
| `generate_keyword_ideas` | Keyword Planner suggestions from seed keywords |
| `get_keyword_volumes` | Historical search volume for specific keywords |
| `get_quality_scores` | Quality scores with component breakdown |
| `get_search_terms` | Actual search queries triggering your ads |

### Geographic & Device
| Tool | Description |
|------|-------------|
| `get_geographic_performance` | Performance by location |
| `get_device_performance` | Performance by device type |

### Insights
| Tool | Description |
|------|-------------|
| `get_recommendations` | Google's AI optimization suggestions |
| `get_change_history` | Recent account changes |

### Write Tools (disabled by default)
Enable with `GOOGLE_ADS_ENABLE_MUTATIONS=true`:

| Tool | Description |
|------|-------------|
| `update_campaign_status` | Pause/enable a campaign |
| `update_ad_group_status` | Pause/enable an ad group |
| `update_ad_status` | Pause/enable an ad |
| `update_campaign_budget` | Change daily budget amount |
| `add_negative_keywords` | Add negative keywords to a campaign |

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Yes | — | API developer token |
| `GOOGLE_ADS_CREDENTIALS_PATH` | Yes | — | Path to OAuth client JSON |
| `GOOGLE_ADS_AUTH_TYPE` | No | `oauth` | `oauth` or `service_account` |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | No | — | MCC manager account ID |
| `GOOGLE_ADS_IMPERSONATION_EMAIL` | No | — | Service account impersonation email |
| `GOOGLE_ADS_ENABLE_MUTATIONS` | No | `false` | Enable write tools |
| `GOOGLE_ADS_API_VERSION` | No | `v23` | Google Ads API version |

## Updates

**Using `npx @latest`** (recommended): You always get the latest version — no manual updates needed.

**Using a binary**: The server checks for new releases on startup and logs to stderr if outdated:

```
[mcp-gads] v0.2.0 available (current: v0.1.0). Download: https://github.com/pijusz/mcp-gads/releases/latest
```

Check your installed version:

```bash
mcp-gads --version
```

To update, download the new binary and replace the old one.

## Development

Requires [Bun](https://bun.sh/).

```bash
git clone https://github.com/pijusz/mcp-gads.git
cd mcp-gads
bun install
bun test           # tests
bun run build      # standalone binary
bun run inspect    # MCP Inspector
bun run check      # biome format + lint
```

## License

MIT
