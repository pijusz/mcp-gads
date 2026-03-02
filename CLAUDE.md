# mcp-gads

Google Ads MCP server in Bun/TypeScript. See [AGENTS.md](AGENTS.md) for detailed guidelines.

## Quick reference

- **Runtime:** Bun (dev) / Node (built)
- **Entry:** `src/index.ts`
- **Build:** `bun run build` → `dist/index.js`
- **Test:** `bun test`
- **API version:** v23 (Google Ads REST API)

## Key patterns

- All tools return `{ content: [{ type: "text", text }] }` — MCP tool response format
- `fetchWithRetry` in `services/google-ads-api.ts` handles 429/5xx with exponential backoff
- Date filters use `buildDateFilter(days)` which falls back to BETWEEN for non-standard day counts
- Mutation tools are gated by `GOOGLE_ADS_ENABLE_MUTATIONS=true` env var

## Prod testing (published package)

Use the published package for production validation:

```bash
claude mcp add gads --scope user --transport stdio \
  -e GOOGLE_ADS_DEVELOPER_TOKEN=... \
  -e GOOGLE_ADS_CREDENTIALS_PATH=/abs/path/to/token-or-client.json \
  -- npx -y mcp-gads@latest
```

If you see `handshaking ... connection closed: initialize response`, the process is exiting before MCP init. Check these first:

1. `npx -y mcp-gads@latest --version` works (npm registry reachable).
2. `GOOGLE_ADS_DEVELOPER_TOKEN` is set in MCP env.
3. `GOOGLE_ADS_CREDENTIALS_PATH` exists and is readable.
4. For OAuth client JSON, companion token file exists (`*_token.json`) or run `npx -y mcp-gads@latest setup`.
