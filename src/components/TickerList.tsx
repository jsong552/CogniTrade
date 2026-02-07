import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/lib/tradingStore';
import { motion } from 'framer-motion';
import { X, Plus } from 'lucide-react';

interface TickerData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface TickerListProps {
  selectedTicker: string;
  onSelect: (ticker: TickerData) => void;
  showRemoveButton?: boolean;
}

// Stock names lookup
const STOCK_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.',
  TSLA: 'Tesla Inc.',
  NVDA: 'NVIDIA Corp.',
  MSFT: 'Microsoft Corp.',
  GOOGL: 'Alphabet Inc.',
  AMZN: 'Amazon.com Inc.',
  META: 'Meta Platforms',
  SPY: 'S&P 500 ETF',
  QQQ: 'Nasdaq 100 ETF',
  AMD: 'AMD Inc.',
  NFLX: 'Netflix Inc.',
  DIS: 'Walt Disney Co.',
  BA: 'Boeing Co.',
  JPM: 'JPMorgan Chase',
  V: 'Visa Inc.',
  JNJ: 'Johnson & Johnson',
  WMT: 'Walmart Inc.',
  PG: 'Procter & Gamble',
  UNH: 'UnitedHealth',
  HD: 'Home Depot',
  COST: 'Costco',
  PLTR: 'Palantir',
  COIN: 'Coinbase',
  LULU: 'Lululemon',
  OPEN: 'Opendoor',
  ATZ: 'Aritzia',
  RY: 'Royal Bank',
};

// Get API keys from environment variables
const ALPACA_API_KEY = import.meta.env.VITE_ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = import.meta.env.VITE_ALPACA_SECRET_KEY || '';

export function TickerList({ selectedTicker, onSelect, showRemoveButton = false }: TickerListProps) {
  const { watchlist, removeFromWatchlist, updateWatchlistPrice, watchlistPrices, updatePrice } = useTradingStore();
  const [loading, setLoading] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');

  // Fetch prices for all watchlist tickers
  const fetchPrices = useCallback(async () => {
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY || watchlist.length === 0) return;

    setLoading(true);
    try {
      // Fetch latest trade for each symbol
      const symbols = watchlist.join(',');
      const response = await fetch(
        `https://data.alpaca.markets/v2/stocks/trades/latest?symbols=${symbols}&feed=iex`,
        {
          headers: {
            'APCA-API-KEY-ID': ALPACA_API_KEY,
            'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const trades = data.trades || {};

        // Also fetch previous close for change calculation
        const barsResponse = await fetch(
          `https://data.alpaca.markets/v2/stocks/bars/latest?symbols=${symbols}&feed=iex`,
          {
            headers: {
              'APCA-API-KEY-ID': ALPACA_API_KEY,
              'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
            },
          }
        );

        const barsData = barsResponse.ok ? await barsResponse.json() : { bars: {} };
        const bars = barsData.bars || {};

        for (const symbol of watchlist) {
          const trade = trades[symbol];
          const bar = bars[symbol];

          if (trade) {
            const price = trade.p;
            const prevClose = bar?.c || price;
            const change = price - prevClose;
            const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

            updateWatchlistPrice(symbol, price, change, changePercent);
            updatePrice(symbol, price);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch watchlist prices:', err);
    } finally {
      setLoading(false);
    }
  }, [watchlist, updateWatchlistPrice, updatePrice]);

  // Fetch prices on mount and every 5 seconds
  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const handleRemove = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromWatchlist(symbol);
  };

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = newSymbol.trim().toUpperCase();
    if (symbol) {
      useTradingStore.getState().addToWatchlist(symbol);
      setNewSymbol('');
      setShowAddInput(false);
    }
  };

  // Build ticker data
  const tickers: TickerData[] = watchlist.map(symbol => {
    const priceData = watchlistPrices[symbol];
    return {
      symbol,
      name: STOCK_NAMES[symbol] || symbol,
      price: priceData?.price || 0,
      change: priceData?.change || 0,
      changePercent: priceData?.changePercent || 0,
    };
  });

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-3 mb-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Watchlist {loading && <span className="text-xs normal-case">⟳</span>}
        </h3>
        <button
          onClick={() => setShowAddInput(!showAddInput)}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          title="Add symbol"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add symbol input */}
      {showAddInput && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          onSubmit={handleAddSymbol}
          className="px-3 pb-2"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="Enter symbol..."
              className="flex-1 px-2 py-1.5 bg-muted border border-border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Add
            </button>
          </div>
        </motion.form>
      )}

      {tickers.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
          No tickers in watchlist
        </div>
      ) : (
        tickers.map((ticker, i) => {
          const isPositive = ticker.changePercent >= 0;
          const isSelected = selectedTicker === ticker.symbol;

          return (
            <motion.div
              key={ticker.symbol}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer ${isSelected
                  ? 'bg-accent border border-border/50'
                  : 'hover:bg-accent/50'
                }`}
              onClick={() => onSelect(ticker)}
            >
              <div>
                <div className="font-semibold text-sm">{ticker.symbol}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[120px]">{ticker.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm font-mono font-medium">
                    {ticker.price > 0 ? `$${ticker.price.toFixed(2)}` : '—'}
                  </div>
                  <div className={`text-xs font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
                    {ticker.price > 0
                      ? `${isPositive ? '+' : ''}${ticker.changePercent.toFixed(2)}%`
                      : '—'}
                  </div>
                </div>
                {showRemoveButton && (
                  <button
                    onClick={(e) => handleRemove(ticker.symbol, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                    title="Remove from watchlist"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
