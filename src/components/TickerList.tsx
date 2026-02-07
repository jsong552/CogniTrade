import { useState, useEffect } from 'react';
import { TICKERS } from '@/lib/mockData';
import type { StockTicker } from '@/lib/mockData';
import { fetchStockQuote } from '@/lib/finnhubApi';
import { motion } from 'framer-motion';

interface TickerListProps {
  selectedTicker: string;
  onSelect: (ticker: StockTicker) => void;
}

export function TickerList({ selectedTicker, onSelect }: TickerListProps) {
  const [tickers, setTickers] = useState<StockTicker[]>(TICKERS);
  const [loading, setLoading] = useState(false);

  // Fetch real-time quote for selected ticker only
  useEffect(() => {
    const fetchQuote = async () => {
      if (!selectedTicker) {
        return;
      }

      setLoading(true);
      try {
        const quote = await fetchStockQuote(selectedTicker);
        let updatedSelected: StockTicker | null = null;

        setTickers(prev => prev.map(ticker => {
          if (ticker.symbol !== selectedTicker) {
            return ticker;
          }

          const price = Number.isFinite(quote.c) ? quote.c : ticker.price;
          const change = Number.isFinite(quote.d) ? quote.d : ticker.change;
          const changePercent = Number.isFinite(quote.dp) ? quote.dp : ticker.changePercent;

          const hasChanged =
            price !== ticker.price ||
            change !== ticker.change ||
            changePercent !== ticker.changePercent;

          if (!hasChanged) {
            return ticker;
          }

          const updated = {
            ...ticker,
            price,
            change,
            changePercent,
          };

          updatedSelected = updated;
          return updated;
        }));

        if (updatedSelected) {
          onSelect(updatedSelected);
        }
      } catch (err) {
        console.warn(`Failed to fetch quote for ${selectedTicker}, using mock data`);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
    const interval = setInterval(fetchQuote, 5000);
    return () => clearInterval(interval);
  }, [onSelect, selectedTicker]);

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-3">
        Watchlist {loading && <span className="text-xs normal-case">⟳</span>}
      </h3>
      {tickers.map((ticker, i) => {
        const displayPrice = Number.isFinite(ticker.price) ? ticker.price : null;
        const displayChangePercent = Number.isFinite(ticker.changePercent) ? ticker.changePercent : null;
        const isPositive = (displayChangePercent ?? 0) >= 0;
        const isSelected = selectedTicker === ticker.symbol;

        return (
          <motion.button
            key={ticker.symbol}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onSelect(ticker)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left ${
              isSelected
                ? 'bg-accent border border-border/50'
                : 'hover:bg-accent/50'
            }`}
          >
            <div>
              <div className="font-semibold text-sm">{ticker.symbol}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[120px]">{ticker.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono font-medium">
                {displayPrice !== null ? `$${displayPrice.toFixed(2)}` : '—'}
              </div>
              <div className={`text-xs font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
                {displayChangePercent !== null
                  ? `${isPositive ? '+' : ''}${displayChangePercent.toFixed(2)}%`
                  : '—'}
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
