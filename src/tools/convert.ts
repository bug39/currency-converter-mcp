import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as frankfurter from "../lib/frankfurter.js";
import * as cache from "../lib/cache.js";
import { success, error } from "../lib/responses.js";

export function register(server: McpServer) {
  server.registerTool("currency_convert", {
    description: "Convert an amount between two currencies using ECB daily reference rates. Returns converted amount, exchange rate, inverse rate, and rate date. Supports 30+ fiat currencies.",
    annotations: {
      title: "Convert Currency",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      amount: z.number().positive().describe("Amount to convert (must be positive)"),
      from: z.string().regex(/^[A-Z]{3}$/).describe("Source currency code (e.g. USD)"),
      to: z.string().regex(/^[A-Z]{3}$/).describe("Target currency code (e.g. EUR)"),
    },
    outputSchema: {
      success: z.boolean(),
      fetchedAt: z.string(),
      source: z.string(),
      cached: z.boolean(),
      result: z.object({
        amount: z.number(),
        from: z.string(),
        to: z.string(),
        rate: z.number(),
        inverseRate: z.number(),
        convertedAmount: z.number(),
        date: z.string(),
      }),
    },
  }, async ({ amount, from, to }) => {
    if (from === to) {
      const date = new Date().toISOString().split("T")[0];
      return success(
        `${formatAmount(amount)} ${from} = ${formatAmount(amount)} ${to} (same currency)`,
        { result: { amount, from, to, rate: 1, inverseRate: 1, convertedAmount: amount, date } },
        { cached: false },
      );
    }

    const cacheKey = `latest:${from}:${to}`;
    const cached = cache.get<frankfurter.RatesResponse>(cacheKey);
    if (cached && cached.rates[to]) {
      return formatConversion(amount, from, to, cached.rates[to], cached.date, true);
    }

    try {
      const data = await frankfurter.getLatestRates(from, to);
      cache.set(cacheKey, data, cache.TTL.LATEST);
      const rate = data.rates[to];
      if (rate === undefined) {
        return error(`Currency "${to}" not found in response. Use currency_list_supported to see supported currencies.`, "INVALID_CURRENCY");
      }
      return formatConversion(amount, from, to, rate, data.date, false);
    } catch (e) {
      if (e instanceof frankfurter.FrankfurterError && e.status === 404) {
        return error(`Invalid currency code. Use currency_list_supported to see supported currencies.`, "INVALID_CURRENCY");
      }
      const stale = cache.getStale<frankfurter.RatesResponse>(cacheKey);
      if (stale?.rates[to]) {
        const result = formatConversion(amount, from, to, stale.rates[to], stale.date, true);
        result.content[0].text += " (rate may be outdated due to API issues)";
        return result;
      }
      return error(`Failed to convert currency: ${e instanceof Error ? e.message : String(e)}`, "API_ERROR");
    }
  });
}

function formatAmount(n: number): string {
  return n % 1 === 0 && n < 1e6 ? n.toString() : n.toFixed(2);
}

function formatConversion(amount: number, from: string, to: string, rate: number, date: string, cached: boolean) {
  const converted = Math.round(amount * rate * 1e6) / 1e6;
  const inverseRate = Math.round((1 / rate) * 1e6) / 1e6;
  const text = `${formatAmount(amount)} ${from} = ${formatAmount(converted)} ${to} (rate: ${rate}, as of ${date})`;
  return success(text, {
    result: { amount, from, to, rate, inverseRate, convertedAmount: converted, date },
  }, { cached });
}
