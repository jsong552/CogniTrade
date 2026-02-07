import { TICKERS, StockTicker } from '@/lib/mockData';
import { motion } from 'framer-motion';

interface TickerListProps {
  selectedTicker: string;
  onSelect: (ticker: StockTicker) => void;
}

export function TickerList({ selectedTicker, onSelect }: TickerListProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-3">
        Watchlist
      </h3>
      {TICKERS.map((ticker, i) => {
        const isPositive = ticker.change >= 0;
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
              <div className="text-sm font-mono font-medium">${ticker.price.toFixed(2)}</div>
              <div className={`text-xs font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
                {isPositive ? '+' : ''}{ticker.changePercent.toFixed(2)}%
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
