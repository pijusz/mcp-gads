import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter } from "../services/format.js";
import { fetchImageBuffer, searchGoogleAds } from "../services/google-ads-api.js";
import type { AssetRow } from "../types.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { readTool } from "../utils/register-tool.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerAssetTools(server: McpServer) {
  readTool(
    server,
    "get_image_assets",
    "Retrieve all image assets in the account including their full-size URLs, dimensions, and file sizes.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      limit: z.number().default(50).describe("Maximum number of image assets to return"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { limit } = args;
      const query = `
        SELECT
          asset.id,
          asset.name,
          asset.type,
          asset.image_asset.full_size.url,
          asset.image_asset.full_size.height_pixels,
          asset.image_asset.full_size.width_pixels,
          asset.image_asset.file_size
        FROM asset
        WHERE asset.type = 'IMAGE'
        LIMIT ${limit}
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No image assets found." }] };
      }

      const lines = [`Image Assets for ${formatCustomerId(customer_id)}`, "=".repeat(80)];
      const rows = data.results as AssetRow[];

      for (let i = 0; i < rows.length; i++) {
        const asset = rows[i]?.asset;
        const img = asset?.imageAsset?.fullSize;

        lines.push(`\n${i + 1}. Asset ID: ${asset?.id ?? "N/A"}`);
        lines.push(`   Name: ${asset?.name ?? "N/A"}`);
        if (img?.url) lines.push(`   Image URL: ${img.url}`);
        if (img?.widthPixels)
          lines.push(`   Dimensions: ${img.widthPixels} x ${img.heightPixels} px`);
        const fileSize = asset?.imageAsset?.fileSize;
        if (fileSize)
          lines.push(`   File Size: ${(Number(fileSize) / 1024).toFixed(2)} KB`);
        lines.push("-".repeat(80));
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  readTool(
    server,
    "download_image_asset",
    "Download a specific image asset by ID to a local directory.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      asset_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .describe("The ID of the image asset to download"),
      output_dir: z
        .string()
        .default("./ad_images")
        .describe("Directory to save the downloaded image"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { asset_id, output_dir } = args;
      const query = `
        SELECT asset.id, asset.name, asset.image_asset.full_size.url
        FROM asset
        WHERE asset.type = 'IMAGE' AND asset.id = ${asset_id}
        LIMIT 1
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: `No image asset found with ID ${asset_id}` }],
        };
      }

      const [row] = data.results as AssetRow[];
      const asset = row?.asset;
      const imageUrl = asset?.imageAsset?.fullSize?.url;
      if (!imageUrl) {
        return {
          content: [
            { type: "text", text: `No download URL found for asset ${asset_id}` },
          ],
        };
      }

      // Validate output directory (prevent path traversal)
      const baseDir = resolve(process.cwd()) + sep;
      let resolvedDir = resolve(output_dir);
      if (!(resolvedDir + sep).startsWith(baseDir)) {
        resolvedDir = resolve(process.cwd(), "ad_images");
      }

      await mkdir(resolvedDir, { recursive: true });

      const buf = await fetchImageBuffer(imageUrl);
      const safeName = (asset.name ?? "image").replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `${asset_id}_${safeName}.jpg`;
      const filePath = resolve(resolvedDir, filename);
      await writeFile(filePath, buf);

      return {
        content: [
          { type: "text", text: `Downloaded image asset ${asset_id} to ${filePath}` },
        ],
      };
    },
  );

  readTool(
    server,
    "get_asset_usage",
    "Find where specific assets are being used in campaigns and ad groups.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      asset_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .optional()
        .describe("Optional: specific asset ID to look up"),
      asset_type: z
        .string()
        .default("IMAGE")
        .describe("Asset type: IMAGE, TEXT, VIDEO, etc."),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { asset_id, asset_type } = args;
      const whereClause = asset_id
        ? `asset.type = '${asset_type}' AND asset.id = ${asset_id}`
        : `asset.type = '${asset_type}'`;

      const assetsQuery = `
        SELECT asset.id, asset.name, asset.type
        FROM asset
        WHERE ${whereClause}
        LIMIT 100
      `;

      const campaignQuery = `
        SELECT campaign.id, campaign.name, asset.id, asset.name, asset.type
        FROM campaign_asset
        WHERE ${whereClause}
        LIMIT 500
      `;

      const adGroupQuery = `
        SELECT ad_group.id, ad_group.name, asset.id, asset.name, asset.type
        FROM ad_group_asset
        WHERE ${whereClause}
        LIMIT 500
      `;

      const [assetsData, campaignData, adGroupData] = await Promise.all([
        searchGoogleAds(customer_id, assetsQuery),
        searchGoogleAds(customer_id, campaignQuery),
        searchGoogleAds(customer_id, adGroupQuery),
      ]);

      if (!assetsData.results?.length) {
        return { content: [{ type: "text", text: `No ${asset_type} assets found.` }] };
      }

      const usageMap = new Map<
        string,
        { name: string; campaigns: string[]; adGroups: string[] }
      >();

      for (const row of assetsData.results as AssetRow[]) {
        const asset = row.asset;
        if (!asset?.id) {
          continue;
        }
        usageMap.set(asset.id, {
          name: asset.name ?? "Unnamed",
          campaigns: [],
          adGroups: [],
        });
      }

      for (const row of (campaignData.results ?? []) as AssetRow[]) {
        const id = row.asset?.id;
        const campaignName = row.campaign?.name;
        const campaignId = row.campaign?.id;
        if (id && campaignName && campaignId && usageMap.has(id)) {
          usageMap.get(id)?.campaigns.push(`${campaignName} (${campaignId})`);
        }
      }

      for (const row of (adGroupData.results ?? []) as AssetRow[]) {
        const id = row.asset?.id;
        const adGroupName = row.adGroup?.name;
        const adGroupId = row.adGroup?.id;
        if (id && adGroupName && adGroupId && usageMap.has(id)) {
          usageMap.get(id)?.adGroups.push(`${adGroupName} (${adGroupId})`);
        }
      }

      const lines = [`Asset Usage for ${formatCustomerId(customer_id)}`, "=".repeat(80)];

      for (const [id, info] of usageMap) {
        lines.push(`\nAsset ID: ${id}`);
        lines.push(`Name: ${info.name}`);
        if (info.campaigns.length) {
          lines.push("Campaigns:");
          for (const c of info.campaigns) lines.push(`  - ${c}`);
        }
        if (info.adGroups.length) {
          lines.push("Ad Groups:");
          for (const ag of info.adGroups) lines.push(`  - ${ag}`);
        }
        if (!info.campaigns.length && !info.adGroups.length) {
          lines.push("  (not currently linked to any campaigns or ad groups)");
        }
        lines.push("=".repeat(80));
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  readTool(
    server,
    "analyze_image_assets",
    "Analyze image asset performance with metrics like impressions, clicks, conversions, and CTR across campaigns.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days } = args;
      const dateFilter = buildDateFilter(days);
      const query = `
        SELECT
          asset.id,
          asset.name,
          asset.image_asset.full_size.url,
          asset.image_asset.full_size.width_pixels,
          asset.image_asset.full_size.height_pixels,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.conversions,
          metrics.cost_micros
        FROM campaign_asset
        WHERE asset.type = 'IMAGE' AND ${dateFilter}
        ORDER BY metrics.impressions DESC
        LIMIT 200
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: "No image asset performance data found." }],
        };
      }

      const grouped = new Map<
        string,
        {
          name: string;
          url: string;
          dims: string;
          impressions: number;
          clicks: number;
          conversions: number;
          costMicros: number;
          campaigns: Set<string>;
        }
      >();

      for (const row of data.results as AssetRow[]) {
        const asset = row.asset;
        const id = asset?.id;
        if (!id) {
          continue;
        }

        const metrics = row.metrics;

        if (!grouped.has(id)) {
          const img = asset.imageAsset?.fullSize;
          grouped.set(id, {
            name: asset.name ?? `Asset ${id}`,
            url: img?.url ?? "N/A",
            dims: `${img?.widthPixels ?? "?"} x ${img?.heightPixels ?? "?"} px`,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            costMicros: 0,
            campaigns: new Set(),
          });
        }

        const group = grouped.get(id);
        if (!group) {
          continue;
        }

        group.impressions += Number(metrics?.impressions ?? 0);
        group.clicks += Number(metrics?.clicks ?? 0);
        group.conversions += Number(metrics?.conversions ?? 0);
        group.costMicros += Number(metrics?.costMicros ?? 0);
        if (row.campaign?.name) {
          group.campaigns.add(row.campaign.name);
        }
      }

      const sorted = [...grouped.entries()].sort(
        (a, b) => b[1].impressions - a[1].impressions,
      );

      const lines = [
        `Image Asset Performance for ${formatCustomerId(customer_id)} (last ${days} days)`,
        "=".repeat(100),
      ];

      for (const [id, d] of sorted) {
        const ctr =
          d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) : "0.00";
        lines.push(`\nAsset ID: ${id}`);
        lines.push(`Name: ${d.name} | Dimensions: ${d.dims}`);
        lines.push(
          `Impressions: ${d.impressions.toLocaleString()} | Clicks: ${d.clicks.toLocaleString()} | CTR: ${ctr}%`,
        );
        lines.push(
          `Conversions: ${d.conversions.toFixed(2)} | Cost (micros): ${d.costMicros.toLocaleString()}`,
        );
        lines.push(
          `Campaigns: ${[...d.campaigns].slice(0, 5).join(", ")}${d.campaigns.size > 5 ? ` +${d.campaigns.size - 5} more` : ""}`,
        );
        if (d.url !== "N/A") lines.push(`URL: ${d.url}`);
        lines.push("-".repeat(100));
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
