# Agent Guidelines for mcp-gads

## Project Structure

```
src/
├── index.ts                  # Entry point (stdio transport + setup dispatch)
├── server.ts                 # McpServer creation + tool registration
├── auth/
│   ├── index.ts              # Auth router + getAuthHeaders()
│   ├── oauth.ts              # OAuth 2.0 token load/refresh
│   ├── service-account.ts    # Service account JWT auth
│   └── setup.ts              # Interactive credential helper
├── services/
│   ├── google-ads-api.ts     # Central REST client with retry logic
│   └── format.ts             # Table/JSON/CSV response formatters
├── tools/
│   ├── index.ts              # Barrel: registers all tools on server
│   ├── accounts.ts           # list_accounts, get_account_currency, get_account_hierarchy
│   ├── queries.ts            # execute_gaql_query, run_gaql, list_resources
│   ├── campaigns.ts          # get_campaign_performance, get_budget_utilization
│   ├── ads.ts                # get_ad_performance, get_ad_creatives
│   ├── assets.ts             # get_image_assets, download_image_asset, get_asset_usage, analyze_image_assets
│   ├── keywords.ts           # generate_keyword_ideas, get_keyword_volumes, get_quality_scores, get_search_terms
│   ├── geo.ts                # get_geographic_performance, get_device_performance
│   ├── insights.ts           # get_recommendations, get_change_history
│   └── mutations.ts          # Write tools (disabled by default)
├── config/
│   └── env.ts                # Zod-validated env vars
└── utils/
    ├── customer-id.ts        # formatCustomerId()
    └── logger.ts             # stderr-only logger
```

## Authentication

Two methods:
- **OAuth 2.0** — Run `bun run setup` to authorize interactively
- **Service Account** — Set `GOOGLE_ADS_AUTH_TYPE=service_account`

Auth headers are built centrally in `auth/index.ts` → `getAuthHeaders()`.

## GAQL Query Guidelines

### Field Categories
1. **RESOURCE**: Primary entity (FROM clause) — `campaign`, `ad_group`, `ad_group_ad`, etc.
2. **ATTRIBUTE**: Properties — `campaign.id`, `campaign.name`
3. **SEGMENT**: Segmentation — `segments.date`, `segments.device`
4. **METRIC**: Performance data — `metrics.impressions`, `metrics.clicks`, `metrics.cost_micros`

### Date Ranges
```sql
WHERE segments.date DURING LAST_7_DAYS
WHERE segments.date DURING LAST_30_DAYS
WHERE segments.date BETWEEN '2024-01-01' AND '2024-01-31'
```

### Best Practices
1. Only select fields you need
2. Always filter with WHERE
3. Use ORDER BY + LIMIT for consistent results
4. Cost values are in micros (1,000,000 = 1 unit of currency)
5. Check `buildDateFilter()` for smart date handling

## Adding New Tools

1. Create or edit a file in `src/tools/`
2. Export a `registerXTools(server: McpServer)` function
3. Use `server.tool(name, description, zodSchema, handler)`
4. Handler must return `{ content: [{ type: "text", text }] }`
5. Import and call registration in `src/tools/index.ts`

## Mutation Tools

Gated by `GOOGLE_ADS_ENABLE_MUTATIONS=true`. When false (default), mutation tools aren't registered — invisible to AI clients. All mutation tool descriptions start with "⚠️ WRITE OPERATION".
