import { useTradingStore, useAllOrders } from '@/lib/tradingStore';
import { Button } from '@/components/ui/button';
import { Download, X, Clock, Check, Ban } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export function TradeLog() {
  const { cancelPendingOrder, trades } = useTradingStore();
  const allOrders = useAllOrders();

  const escapeCsvField = (value: string) => {
    if (value.includes('"')) {
      value = value.replace(/"/g, '""');
    }
    return /[",\n]/.test(value) ? `"${value}"` : value;
  };

  const downloadCSV = () => {
    const headers = ['Date', 'Ticker', 'Type', 'Order Type', 'Qty', 'Price', 'Total', 'Status', 'Stop Loss', 'Take Profit'];
    const rows = trades.map(t => [
      escapeCsvField(new Date(t.timestamp).toLocaleString()),
      escapeCsvField(t.ticker),
      escapeCsvField(t.type),
      escapeCsvField(t.orderType),
      t.quantity.toString(),
      t.price.toFixed(2),
      t.total.toFixed(2),
      escapeCsvField(t.status),
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

  const handleCancel = (orderId: string, ticker: string) => {
    cancelPendingOrder(orderId);
    toast.success(`Cancelled pending order for ${ticker}`);
  };

  const getStatusIcon = (status: string, isPending: boolean) => {
    if (isPending || status === 'pending') {
      return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    }
    if (status === 'filled') {
      return <Check className="h-3.5 w-3.5 text-gain" />;
    }
    if (status === 'cancelled') {
      return <Ban className="h-3.5 w-3.5 text-muted-foreground" />;
    }
    return null;
  };

  const getStatusLabel = (status: string, isPending: boolean) => {
    if (isPending || status === 'pending') return 'Pending';
    if (status === 'filled') return 'Filled';
    if (status === 'cancelled') return 'Cancelled';
    return status;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Trade History & Pending Orders</h3>
        <Button variant="outline" size="sm" onClick={downloadCSV} className="text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gain" />
          <span>Filled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground" />
          <span>Cancelled</span>
        </div>
      </div>

      {allOrders.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No trades yet</div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {allOrders.map((order, i) => {
            const isPending = order.isPending || order.status === 'pending';
            const isCancelled = order.status === 'cancelled';

            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${isPending
                  ? 'bg-amber-500/5 border border-amber-500/20'
                  : isCancelled
                    ? 'bg-muted/30 opacity-60'
                    : 'bg-muted/50 hover:bg-muted'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-8 rounded-full ${isPending
                    ? 'bg-amber-500'
                    : isCancelled
                      ? 'bg-muted-foreground'
                      : order.type === 'buy' ? 'bg-gain' : 'bg-loss'
                    }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isCancelled ? 'line-through' : ''}`}>
                        {order.ticker}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isPending
                        ? 'bg-amber-500/15 text-amber-500'
                        : isCancelled
                          ? 'bg-muted text-muted-foreground'
                          : order.type === 'buy' ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'
                        }`}>
                        {order.type.toUpperCase()}
                      </span>
                      <span className={`text-xs ${isPending ? 'text-amber-500' : 'text-muted-foreground'}`}>
                        {order.orderType}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${isPending ? 'text-amber-500' : isCancelled ? 'text-muted-foreground' : 'text-gain'
                        }`}>
                        {getStatusIcon(order.status, order.isPending)}
                        {getStatusLabel(order.status, order.isPending)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(order.timestamp).toLocaleString()}
                      {isPending && (
                        <span className="ml-2 text-amber-500">
                          • Waiting for price ≤ ${order.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-sm font-mono ${isCancelled ? 'text-muted-foreground' : ''}`}>
                      {order.quantity} × ${order.price.toFixed(2)}
                    </div>
                    <div className={`text-xs font-mono ${isCancelled ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                      ${order.total.toFixed(2)}
                    </div>
                  </div>
                  {isPending && (
                    <button
                      onClick={() => handleCancel(order.id, order.ticker)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                      title="Cancel order"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
