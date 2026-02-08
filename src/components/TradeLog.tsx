import { useEffect, useMemo, useState } from 'react';
import { useTradingStore, useAllOrders } from '@/lib/tradingStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, X, Clock, Check, Ban, FileText, AudioLines, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export function TradeLog() {
  const { cancelPendingOrder, trades } = useTradingStore();
  const allOrders = useAllOrders();
  const [activeLog, setActiveLog] = useState<any | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<Record<string, string> | null>(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

  const analysisEntries = useMemo(() => {
    if (!analysisData) return [];
    const entries = Object.entries(analysisData).map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' '),
      value,
      numeric: Number(String(value).replace('%', '')) || 0,
    }));
    return entries.sort((a, b) => b.numeric - a.numeric);
  }, [analysisData]);

  useEffect(() => {
    if (!activeLog) return;
    const text = (activeLog.transcript || activeLog.note || '').trim();

    setAnalysisData(null);
    setAnalysisError(null);

    if (!text) return;

    const controller = new AbortController();
    const load = async () => {
      setAnalysisLoading(true);
      try {
        const response = await fetch(`${backendUrl}/analyze_journal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error || 'Failed to analyze journal');
        }

        const payload = await response.json();
        const percentages = payload?.percentages as Record<string, string> | undefined;
        if (percentages && Object.keys(percentages).length > 0) {
          setAnalysisData(percentages);
        } else if (payload?.biases) {
          const fallback: Record<string, string> = {};
          Object.entries(payload.biases as Record<string, number>).forEach(([key, value]) => {
            fallback[key] = `${Math.round(value * 100)}%`;
          });
          setAnalysisData(fallback);
        } else {
          setAnalysisData(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAnalysisError(error instanceof Error ? error.message : 'Unable to analyze journal');
        }
      } finally {
        if (!controller.signal.aborted) {
          setAnalysisLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [activeLog, backendUrl]);

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
            const hasNote = Boolean(order.note || order.transcript);

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
                role="button"
                tabIndex={0}
                onClick={() => setActiveLog(order)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveLog(order);
                  }
                }}
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
                      {hasNote && (
                        <span className="flex items-center gap-1 text-xs text-primary">
                          <FileText className="h-3 w-3" />
                          Note
                        </span>
                      )}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCancel(order.id, order.ticker);
                      }}
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

      <Dialog open={Boolean(activeLog)} onOpenChange={(open) => !open && setActiveLog(null)}>
        <DialogContent className="max-w-6xl w-full">
          <DialogHeader>
            <DialogTitle>Trade Log Details</DialogTitle>
            <DialogDescription>
              Review the recorded note and transcription for this trade.
            </DialogDescription>
          </DialogHeader>

          {activeLog && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>
                  <div className="text-[11px] uppercase tracking-wide">Ticker</div>
                  <div className="text-sm text-foreground font-semibold">{activeLog.ticker}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide">Order</div>
                  <div className="text-sm text-foreground font-semibold">
                    {activeLog.type?.toUpperCase()} · {activeLog.orderType}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide">Quantity</div>
                  <div className="text-sm text-foreground font-semibold">{activeLog.quantity}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide">Price</div>
                  <div className="text-sm text-foreground font-semibold">${activeLog.price?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide">Total</div>
                  <div className="text-sm text-foreground font-semibold">${activeLog.total?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide">Time</div>
                  <div className="text-sm text-foreground font-semibold">
                    {new Date(activeLog.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <AudioLines className="h-4 w-4" />
                      Transcript
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                      {activeLog.transcript || 'No transcript saved for this log.'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4" />
                      Notes
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                      {activeLog.note || 'No notes saved for this log.'}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/30 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4" />
                      Behavior Analysis
                    </div>
                    {analysisLoading && (
                      <span className="text-xs text-muted-foreground">Analyzing...</span>
                    )}
                  </div>

                  {analysisError && (
                    <div className="text-xs text-loss">{analysisError}</div>
                  )}

                  {!analysisLoading && !analysisError && analysisEntries.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      Add a transcript or note to see behavior probabilities.
                    </div>
                  )}

                  <div className="space-y-3">
                    {analysisEntries.map((entry) => (
                      <div key={entry.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="text-foreground font-medium">{entry.label}</span>
                          <span>{entry.value}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary/80"
                            style={{ width: `${Math.min(entry.numeric, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
