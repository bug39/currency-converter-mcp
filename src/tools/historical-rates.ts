import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as frankfurter from "../lib/frankfurter.js";
import * as cache from "../lib/cache.js";
import { success, error } from "../lib/responses.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST_DATE = "1999-01-04"; // ECB data starts here

function isValidDate(date: string): boolean {
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function register(server: McpServer) {
  server.registerTool("currency_get_historical_rates", {
    description: "Get exchange rates for a specific historical date. ECB data available from 1999-01-04 onward. Weekend/holiday dates return the nearest available rates.",
    annotations: {
      title: "Get Historical Rates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date in YYYY-MM-DD format (earliest: 1999-01-04)"),
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
  }, async ({ date, base, symbols }) => {
    if (!DATE_REGEX.test(date)) {
      return error(`Invalid date format "${date}". Use YYYY-MM-DD.`, "INVALID_DATE");
    }

    if (!isValidDate(date)) {
      return error(`Invalid date "${date}" (does not exist on the calendar).`, "INVALID_DATE");
    }

    if (date < EARLIEST_DATE) {
      return error(`Date ${date} is before ECB data availability (earliest: ${EARLIEST_DATE}).`, "DATE_OUT_OF_RANGE");
    }

    const today = new Date().toISOString().split("T")[0];
    if (date > today) {
      return error(`Date ${date} is in the future. Use currency_get_rates for current rates.`, "FUTURE_DATE");
    }

    const cacheKey = `hist:${date}:${base}:${symbols ?? ""}`;
    const cached = cache.get<frankfurter.RatesResponse>(cacheKey);
    if (cached) {
      return formatHistorical(cached, date, true);
    }

    try {
      const data = await frankfurter.getHistoricalRates(date, base, symbols);
      cache.set(cacheKey, data, cache.TTL.HISTORICAL);
      return formatHistorical(data, date, false);
    } catch (e) {
      if (e instanceof frankfurter.FrankfurterError && e.status === 404) {
        return error(`Invalid currency code or date. Use currency_list_supported to see supported currencies.`, "INVALID_REQUEST");
      }
      const stale = cache.getStale<frankfurter.RatesResponse>(cacheKey);
      if (stale) {
        return formatHistorical(stale, date, true, " (cached, may be outdated due to API issues)");
      }
      return error(`Failed to fetch historical rates: ${e instanceof Error ? e.message : String(e)}`, "API_ERROR");
    }
  });
}

function formatHistorical(data: frankfurter.RatesResponse, requestedDate: string, cached: boolean, suffix = "") {
  const lines = Object.entries(data.rates).map(([code, rate]) => `  ${code}: ${rate}`);
  const dateNote = data.date !== requestedDate ? ` (nearest available date: ${data.date})` : "";
  const text = `Historical rates for ${data.base} on ${data.date}${dateNote}${suffix}:\n${lines.join("\n")}`;
  return success(text, { base: data.base, date: data.date, rates: data.rates }, { cached });
}
