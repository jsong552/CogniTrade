// Mock stock data
export interface StockTicker {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
}

export interface PricePoint {
  time: string;
  price: number;
}

export interface Trade {
  id: string;
  ticker: string;
  type: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop-loss' | 'take-profit';
  quantity: number;
  price: number;
  total: number;
  timestamp: string;
  status: 'filled' | 'pending' | 'cancelled';
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface Position {
  ticker: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface BehaviorAnalysis {
  pattern: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  occurrences: number;
  suggestion: string;
  score: number;
}

export const TICKERS: StockTicker[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 189.84, change: 2.34, changePercent: 1.25, sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 378.91, change: -1.23, changePercent: -0.32, sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 141.80, change: 0.95, changePercent: 0.67, sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 186.13, change: 3.21, changePercent: 1.75, sector: 'Consumer' },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.42, change: -5.67, changePercent: -2.23, sector: 'Automotive' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 875.28, change: 12.45, changePercent: 1.44, sector: 'Technology' },
  { symbol: 'SPY', name: 'S&P 500 ETF', price: 502.34, change: 1.89, changePercent: 0.38, sector: 'ETF' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', price: 438.12, change: 2.56, changePercent: 0.59, sector: 'ETF' },
  { symbol: 'VOO', name: 'Vanguard S&P 500', price: 461.78, change: 1.72, changePercent: 0.37, sector: 'ETF' },
  { symbol: 'META', name: 'Meta Platforms', price: 484.22, change: 6.78, changePercent: 1.42, sector: 'Technology' },
];

export type TimeRange = '1H' | '1D' | '1W' | '1M' | '1Y';

export function generatePriceData(basePrice: number, range: TimeRange): PricePoint[] {
  const points: PricePoint[] = [];
  let numPoints: number;
  let volatility: number;

  switch (range) {
    case '1H': numPoints = 60; volatility = 0.001; break;
    case '1D': numPoints = 78; volatility = 0.003; break;
    case '1W': numPoints = 35; volatility = 0.008; break;
    case '1M': numPoints = 30; volatility = 0.015; break;
    case '1Y': numPoints = 52; volatility = 0.04; break;
  }

  let price = basePrice * (1 - volatility * 3);
  const now = new Date();

  for (let i = 0; i < numPoints; i++) {
    const change = (Math.random() - 0.48) * basePrice * volatility;
    price = Math.max(price + change, basePrice * 0.7);

    let time: Date;
    switch (range) {
      case '1H':
        time = new Date(now.getTime() - (numPoints - i) * 60 * 1000);
        break;
      case '1D':
        time = new Date(now.getTime() - (numPoints - i) * 5 * 60 * 1000);
        break;
      case '1W':
        time = new Date(now.getTime() - (numPoints - i) * 4.8 * 60 * 60 * 1000);
        break;
      case '1M':
        time = new Date(now.getTime() - (numPoints - i) * 24 * 60 * 60 * 1000);
        break;
      case '1Y':
        time = new Date(now.getTime() - (numPoints - i) * 7 * 24 * 60 * 60 * 1000);
        break;
    }

    const formatTime = () => {
      switch (range) {
        case '1H': return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case '1D': return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        case '1W': return time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        case '1M': return time.toLocaleDateString([], { month: 'short', day: 'numeric' });
        case '1Y': return time.toLocaleDateString([], { month: 'short', year: '2-digit' });
      }
    };

    points.push({ time: formatTime(), price: Number(price.toFixed(2)) });
  }

  // Make last point match current price
  if (points.length > 0) {
    points[points.length - 1].price = basePrice;
  }

  return points;
}

export const MOCK_TRADES: Trade[] = [
  { id: '1', ticker: 'AAPL', type: 'buy', orderType: 'market', quantity: 10, price: 185.50, total: 1855.00, timestamp: '2024-01-15T10:30:00Z', status: 'filled' },
  { id: '2', ticker: 'MSFT', type: 'buy', orderType: 'limit', quantity: 5, price: 370.00, total: 1850.00, timestamp: '2024-01-15T11:15:00Z', status: 'filled', limitPrice: 370.00 },
  { id: '3', ticker: 'AAPL', type: 'sell', orderType: 'market', quantity: 5, price: 188.20, total: 941.00, timestamp: '2024-01-16T09:45:00Z', status: 'filled' },
  { id: '4', ticker: 'TSLA', type: 'buy', orderType: 'market', quantity: 8, price: 245.00, total: 1960.00, timestamp: '2024-01-16T14:20:00Z', status: 'filled' },
  { id: '5', ticker: 'NVDA', type: 'buy', orderType: 'limit', quantity: 3, price: 860.00, total: 2580.00, timestamp: '2024-01-17T10:00:00Z', status: 'filled', limitPrice: 860.00 },
  { id: '6', ticker: 'TSLA', type: 'sell', orderType: 'stop-loss', quantity: 8, price: 240.00, total: 1920.00, timestamp: '2024-01-17T15:30:00Z', status: 'filled', stopLoss: 240.00 },
  { id: '7', ticker: 'SPY', type: 'buy', orderType: 'market', quantity: 15, price: 498.50, total: 7477.50, timestamp: '2024-01-18T09:35:00Z', status: 'filled' },
  { id: '8', ticker: 'GOOGL', type: 'buy', orderType: 'market', quantity: 20, price: 139.50, total: 2790.00, timestamp: '2024-01-18T11:00:00Z', status: 'filled' },
];

export const MOCK_POSITIONS: Position[] = [
  { ticker: 'AAPL', quantity: 5, avgPrice: 185.50, currentPrice: 189.84, totalValue: 949.20, pnl: 21.70, pnlPercent: 2.34 },
  { ticker: 'MSFT', quantity: 5, avgPrice: 370.00, currentPrice: 378.91, totalValue: 1894.55, pnl: 44.55, pnlPercent: 2.41 },
  { ticker: 'NVDA', quantity: 3, avgPrice: 860.00, currentPrice: 875.28, totalValue: 2625.84, pnl: 45.84, pnlPercent: 1.77 },
  { ticker: 'SPY', quantity: 15, avgPrice: 498.50, currentPrice: 502.34, totalValue: 7535.10, pnl: 57.60, pnlPercent: 0.77 },
  { ticker: 'GOOGL', quantity: 20, avgPrice: 139.50, currentPrice: 141.80, totalValue: 2836.00, pnl: 46.00, pnlPercent: 1.65 },
];

export const MOCK_BEHAVIOR_ANALYSIS: BehaviorAnalysis[] = [
  {
    pattern: 'FOMO Trading',
    description: 'Entering positions after significant price movements, buying at peaks driven by fear of missing out.',
    severity: 'high',
    occurrences: 7,
    suggestion: 'Set entry criteria before market opens. Only enter trades that meet your predefined setup.',
    score: 72,
  },
  {
    pattern: 'Loss Aversion',
    description: 'Holding losing positions too long while cutting winners short, resulting in asymmetric risk/reward.',
    severity: 'medium',
    occurrences: 4,
    suggestion: 'Use predetermined stop-losses. Set take-profit targets at 2:1 reward-to-risk minimum.',
    score: 58,
  },
  {
    pattern: 'Revenge Trading',
    description: 'Increasing position sizes or frequency after losses to recoup, leading to compounding losses.',
    severity: 'high',
    occurrences: 3,
    suggestion: 'Implement a daily loss limit. Step away after 2 consecutive losses.',
    score: 85,
  },
  {
    pattern: 'Overtrading',
    description: 'Excessive number of trades with diminishing quality, often driven by boredom or excitement.',
    severity: 'medium',
    occurrences: 12,
    suggestion: 'Limit yourself to 3-5 high-quality setups per day. Keep a pre-trade checklist.',
    score: 45,
  },
  {
    pattern: 'Anchoring Bias',
    description: 'Fixating on purchase price rather than current market conditions when making decisions.',
    severity: 'low',
    occurrences: 5,
    suggestion: 'Focus on current chart patterns and levels, not your entry price.',
    score: 35,
  },
];

export const INITIAL_BALANCE = 100000;
