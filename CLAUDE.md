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
