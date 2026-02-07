import type { Position } from '@/lib/tradingStore';
import { motion } from 'framer-motion';

interface PortfolioSummaryProps {
  balance: number;
  portfolioValue: number;
  totalPnl: number;
  positions: Position[];
}

export function PortfolioSummary({ balance, portfolioValue, totalPnl, positions }: PortfolioSummaryProps) {
  const pnlPercent = totalPnl / (portfolioValue - totalPnl) * 100;
  const isPositive = totalPnl >= 0;

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5"
      >
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Portfolio Value</div>
        <div className="text-3xl font-bold font-mono">
          ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        <div className={`text-sm font-mono mt-1 ${isPositive ? 'text-gain' : 'text-loss'}`}>
          {isPositive ? '+' : ''}${totalPnl.toFixed(2)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(2)}%)
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
          <div>
            <div className="text-xs text-muted-foreground">Cash</div>
            <div className="text-sm font-mono font-medium">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Invested</div>
            <div className="text-sm font-mono font-medium">
              ${positions.reduce((s, p) => s + p.totalValue, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </motion.div>

      {positions.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Positions</h3>
          <div className="space-y-2">
            {positions.map(pos => (
              <div key={pos.ticker} className="flex items-center justify-between py-1.5">
                <div>
                  <span className="text-sm font-semibold">{pos.ticker}</span>
                  <span className="text-xs text-muted-foreground ml-2">{pos.quantity} shares</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">${pos.totalValue.toFixed(2)}</div>
                  <div className={`text-xs font-mono ${pos.pnl >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {pos.pnl >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
