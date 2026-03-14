/**
 * Pump.fun frontend API - fetch token/coin data by mint.
 * Used so the agent can answer questions about a token using live data.
 * @see https://frontend-api-v3.pump.fun/coins/{mint}
 */

const PUMP_API_BASE = "https://frontend-api-v3.pump.fun";

export type PumpCoinData = {
  mint: string;
  name?: string;
  symbol?: string;
  description?: string;
  image_uri?: string;
  bonding_curve?: string;
  creator?: string;
  created_timestamp?: number;
  complete?: boolean;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  total_supply?: number;
  market_cap?: number;
  usd_market_cap?: number;
  real_sol_reserves?: number;
  real_token_reserves?: number;
  twitter?: string;
  website?: string;
  [key: string]: unknown;
};

export async function getCoinData(mint: string): Promise<PumpCoinData | null> {
  const trimmed = mint.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(`${PUMP_API_BASE}/coins/${trimmed}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PumpCoinData;
    return data;
  } catch {
    return null;
  }
}
