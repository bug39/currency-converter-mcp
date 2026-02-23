import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as frankfurter from "../lib/frankfurter.js";
import * as cache from "../lib/cache.js";
import { success, error } from "../lib/responses.js";

const CACHE_KEY = "currencies";

export function register(server: McpServer) {
  server.registerTool("currency_list_supported", {
    description: "List all supported currency codes with full names. Returns 30+ fiat currencies from the European Central Bank.",
    annotations: {
      title: "List Supported Currencies",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {},
    outputSchema: {
      success: z.boolean(),
      fetchedAt: z.string(),
      source: z.string(),
      cached: z.boolean(),
      currencies: z.record(z.string()),
    },
  }, async () => {
    const cached = cache.get<frankfurter.CurrenciesResponse>(CACHE_KEY);
    if (cached) {
      return formatCurrencies(cached, true);
    }

    try {
      const data = await frankfurter.getCurrencies();
      cache.set(CACHE_KEY, data, cache.TTL.CURRENCIES);
      return formatCurrencies(data, false);
    } catch (e) {
      const stale = cache.getStale<frankfurter.CurrenciesResponse>(CACHE_KEY);
      if (stale) {
        return formatCurrencies(stale, true, " (cached, may be outdated)");
      }
      return error(`Failed to fetch currencies: ${e instanceof Error ? e.message : String(e)}`, "API_ERROR");
    }
  });
}

function formatCurrencies(data: frankfurter.CurrenciesResponse, cached: boolean, suffix = "") {
  const lines = Object.entries(data).map(([code, name]) => `${code}: ${name}`);
  const text = `Supported currencies (${lines.length})${suffix}:\n${lines.join("\n")}`;
  return success(text, { currencies: data }, { cached });
}
