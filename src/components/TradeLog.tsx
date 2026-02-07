import { Trade } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { motion } from 'framer-motion';

interface TradeLogProps {
  trades: Trade[];
}

export function TradeLog({ trades }: TradeLogProps) {
  const downloadCSV = () => {
    const headers = ['Date', 'Ticker', 'Type', 'Order Type', 'Qty', 'Price', 'Total', 'Status', 'Stop Loss', 'Take Profit'];
    const rows = trades.map(t => [
      new Date(t.timestamp).toLocaleString(),
      t.ticker,
      t.type,
      t.orderType,
      t.quantity,
      t.price.toFixed(2),
      t.total.toFixed(2),
      t.status,
      t.stopLoss?.toFixed(2) ?? '',
      t.takeProfit?.toFixed(2) ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Trade History</h3>
        <Button variant="outline" size="sm" onClick={downloadCSV} className="text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No trades yet</div>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
          {trades.map((trade, i) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-1.5 h-8 rounded-full ${trade.type === 'buy' ? 'bg-gain' : 'bg-loss'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{trade.ticker}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      trade.type === 'buy' ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'
                    }`}>
                      {trade.type.toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">{trade.orderType}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(trade.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono">{trade.quantity} × ${trade.price.toFixed(2)}</div>
                <div className="text-xs font-mono text-muted-foreground">${trade.total.toFixed(2)}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
