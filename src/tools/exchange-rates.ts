import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as frankfurter from "../lib/frankfurter.js";
import * as cache from "../lib/cache.js";
import { success, error } from "../lib/responses.js";

export function register(server: McpServer) {
  server.registerTool("currency_get_rates", {
    description: "Get current exchange rates for a base currency. Rates from the European Central Bank, updated daily around 16:00 CET. Default base is EUR.",
    annotations: {
      title: "Get Exchange Rates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      base: z.string().regex(/^[A-Z]{3}$/).default("EUR").describe("Base currency code (e.g. USD, EUR, GBP)"),
      symbols: z.string().optional().describe("Comma-separated currency codes to filter (e.g. 'USD,GBP,JPY'). Omit for all."),
    },
    outputSchema: {
      success: z.boolean(),
      fetchedAt: z.string(),
      source: z.string(),
      cached: z.boolean(),
      base: z.string(),
      date: z.string(),
      rates: z.record(z.number()),
    },
  }, async ({ base, symbols }) => {
    const cacheKey = `latest:${base}:${symbols ?? ""}`;
    const cached = cache.get<frankfurter.RatesResponse>(cacheKey);
    if (cached) {
      return formatRates(cached, true);
    }

    try {
      const data = await frankfurter.getLatestRates(base, symbols);
      cache.set(cacheKey, data, cache.TTL.LATEST);
      return formatRates(data, false);
    } catch (e) {
      if (e instanceof frankfurter.FrankfurterError && e.status === 404) {
        return error(`Invalid currency code "${base}". Use currency_list_supported to see supported currencies.`, "INVALID_CURRENCY");
      }
      const stale = cache.getStale<frankfurter.RatesResponse>(cacheKey);
      if (stale) {
        return formatRates(stale, true, " (cached, may be outdated)");
      }
      return error(`Failed to fetch exchange rates: ${e instanceof Error ? e.message : String(e)}`, "API_ERROR");
    }
  });
}

function formatRates(data: frankfurter.RatesResponse, cached: boolean, suffix = "") {
  const lines = Object.entries(data.rates).map(([code, rate]) => `  ${code}: ${rate}`);
  const text = `Exchange rates for ${data.base} as of ${data.date}${suffix}:\n${lines.join("\n")}`;
  return success(text, { base: data.base, date: data.date, rates: data.rates }, { cached });
}
