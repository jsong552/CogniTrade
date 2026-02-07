// Finnhub API service for real-time and historical stock data

const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

class FinnhubError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface FinnhubCandle {
  c: number[]; // Close prices
  h: number[]; // High prices
  l: number[]; // Low prices
  o: number[]; // Open prices
  t: number[]; // Timestamps
  v: number[]; // Volume
  s: string;   // Status
}

export interface FinnhubQuote {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Percent change
  h: number;  // High price of the day
  l: number;  // Low price of the day
  o: number;  // Open price of the day
  pc: number; // Previous close price
  t: number;  // Timestamp
}

export interface FinnhubProfile {
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
  logo: string;
  finnhubIndustry: string;
}

/**
 * Fetch historical candle data for a stock
 * @param symbol Stock ticker symbol
 * @param resolution Supported resolutions: 1, 5, 15, 30, 60, D, W, M
 * @param from Unix timestamp (seconds)
 * @param to Unix timestamp (seconds)
 */
export async function fetchStockCandles(
  symbol: string,
  resolution: string,
  from: number,
  to: number
): Promise<FinnhubCandle> {
  const url = `${BASE_URL}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new FinnhubError(response.status, `Finnhub API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.s === 'no_data') {
    throw new FinnhubError(404, `No data available for ${symbol}`);
  }
  
  return data;
}

/**
 * Fetch real-time quote for a stock
 * @param symbol Stock ticker symbol
 */
export async function fetchStockQuote(symbol: string): Promise<FinnhubQuote> {
  const url = `${BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Fetch company profile
 * @param symbol Stock ticker symbol
 */
export async function fetchCompanyProfile(symbol: string): Promise<FinnhubProfile> {
  const url = `${BASE_URL}/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Get resolution and time range for Finnhub API based on TimeRange
 */
export function getResolutionAndTimeRange(range: '1H' | '1D' | '1W' | '1M' | '1Y'): {
  resolution: string;
  from: number;
  to: number;
} {
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  
  switch (range) {
    case '1H':
      return { resolution: '1', from: now - 3600, to: now }; // 1 minute candles for 1 hour
    case '1D':
      return { resolution: '5', from: now - 86400, to: now }; // 5 minute candles for 1 day
    case '1W':
      return { resolution: '60', from: now - 604800, to: now }; // 1 hour candles for 1 week
    case '1M':
      return { resolution: 'D', from: now - 2592000, to: now }; // Daily candles for 1 month
    case '1Y':
      return { resolution: 'W', from: now - 31536000, to: now }; // Weekly candles for 1 year
    default:
      return { resolution: 'D', from: now - 2592000, to: now };
  }
}

function getFallbackResolutionAndTimeRange(range: '1H' | '1D' | '1W' | '1M' | '1Y'): {
  resolution: string;
  from: number;
  to: number;
} {
  const now = Math.floor(Date.now() / 1000);

  switch (range) {
    case '1H':
    case '1D':
      return { resolution: 'D', from: now - 7 * 86400, to: now };
    case '1W':
      return { resolution: 'D', from: now - 30 * 86400, to: now };
    case '1M':
      return { resolution: 'W', from: now - 180 * 86400, to: now };
    case '1Y':
      return { resolution: 'W', from: now - 2 * 31536000, to: now };
    default:
      return { resolution: 'D', from: now - 30 * 86400, to: now };
  }
}

export async function fetchStockCandlesForRange(
  symbol: string,
  range: '1H' | '1D' | '1W' | '1M' | '1Y'
): Promise<{ candles: FinnhubCandle; usedFallback: boolean }> {
  const { resolution, from, to } = getResolutionAndTimeRange(range);

  try {
    const candles = await fetchStockCandles(symbol, resolution, from, to);
    return { candles, usedFallback: false };
  } catch (err) {
    const status = err instanceof FinnhubError ? err.status : null;
    if (status === 403 || status === 429) {
      const fallback = getFallbackResolutionAndTimeRange(range);
      const candles = await fetchStockCandles(symbol, fallback.resolution, fallback.from, fallback.to);
      return { candles, usedFallback: true };
    }
    throw err;
  }
}

/**
 * Convert Finnhub candle data to PricePoint format
 */
export function convertCandlesToPricePoints(
  candles: FinnhubCandle,
  range: '1H' | '1D' | '1W' | '1M' | '1Y'
): Array<{ time: string; price: number }> {
  if (!candles.c || candles.c.length === 0) {
    return [];
  }
  
  return candles.t.map((timestamp, index) => {
    const date = new Date(timestamp * 1000);
    
    const formatTime = () => {
      switch (range) {
        case '1H':
        case '1D':
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case '1W':
          return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        case '1M':
          return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        case '1Y':
          return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
        default:
          return date.toLocaleDateString();
      }
    };
    
    return {
      time: formatTime(),
      price: Number(candles.c[index].toFixed(2))
    };
  });
}
