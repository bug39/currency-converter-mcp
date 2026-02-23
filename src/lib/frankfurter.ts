const BASE_URL = "https://api.frankfurter.dev/v1";
const TIMEOUT_MS = 10_000;

export interface RatesResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface CurrenciesResponse {
  [code: string]: string;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLatestRates(base?: string, symbols?: string): Promise<RatesResponse> {
  const params = new URLSearchParams();
  if (base) params.set("base", base);
  if (symbols) params.set("symbols", symbols);
  const qs = params.toString();
  const url = `${BASE_URL}/latest${qs ? `?${qs}` : ""}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new FrankfurterError(res.status, await res.text());
  return res.json();
}

export async function getHistoricalRates(date: string, base?: string, symbols?: string): Promise<RatesResponse> {
  const params = new URLSearchParams();
  if (base) params.set("base", base);
  if (symbols) params.set("symbols", symbols);
  const qs = params.toString();
  const url = `${BASE_URL}/${date}${qs ? `?${qs}` : ""}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new FrankfurterError(res.status, await res.text());
  return res.json();
}

export async function getCurrencies(): Promise<CurrenciesResponse> {
  const res = await fetchWithTimeout(`${BASE_URL}/currencies`);
  if (!res.ok) throw new FrankfurterError(res.status, await res.text());
  return res.json();
}

export class FrankfurterError extends Error {
  constructor(public status: number, public body: string) {
    super(`Frankfurter API error ${status}: ${body}`);
    this.name = "FrankfurterError";
  }
}
