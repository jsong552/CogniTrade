import { useState, useRef } from 'react';
import { Upload, FileText, X, Loader2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTradingStore } from '@/lib/tradingStore';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5001';

export interface BiasModelResult {
  windows: Record<string, unknown>[];
  avg_score: number;
  feature_columns: string[];
  feature_data: Record<string, unknown>[];
}

export interface BiasScores {
  overtrading: BiasModelResult;
  revenge: BiasModelResult;
  loss_aversion: BiasModelResult;
}

export interface AgentAnalysisResult {
  thread_id: string;
  report: string;
  scores: BiasScores;
}

interface LogUploadProps {
  onAnalyze: (source: 'uploaded' | 'account', result?: AgentAnalysisResult) => void;
}

/**
 * Convert account trades to the CSV format required by the backend.
 * The backend expects round-trip trades with entry_price, exit_price, profit_loss.
 * We pair up consecutive buy+sell trades for the same ticker.
 */
function convertTradesToCSV(trades: ReturnType<typeof useTradingStore.getState>['trades']): string {
  // Sort trades by timestamp (oldest first)
  const sortedTrades = [...trades]
    .filter(t => t.status === 'filled')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Track open positions per ticker to match buy/sell pairs
  const openPositions: Map<string, { quantity: number; price: number; timestamp: string }[]> = new Map();

  // CSV rows for round-trip trades
  interface RoundTripTrade {
    timestamp: string;
    asset: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    entry_price: number;
    exit_price: number;
    profit_loss: number;
  }
  const roundTripTrades: RoundTripTrade[] = [];

  for (const trade of sortedTrades) {
    const ticker = trade.ticker;

    if (trade.type === 'buy') {
      // Add to open positions
      if (!openPositions.has(ticker)) {
        openPositions.set(ticker, []);
      }
      openPositions.get(ticker)!.push({
        quantity: trade.quantity,
        price: trade.price,
        timestamp: trade.timestamp,
      });
    } else if (trade.type === 'sell') {
      // Match with open position(s) using FIFO
      const positions = openPositions.get(ticker) || [];
      let remainingSellQty = trade.quantity;

      while (remainingSellQty > 0 && positions.length > 0) {
        const position = positions[0];
        const matchQty = Math.min(remainingSellQty, position.quantity);

        // Calculate profit/loss for this matched portion
        const entryPrice = position.price;
        const exitPrice = trade.price;
        const profitLoss = (exitPrice - entryPrice) * matchQty;

        roundTripTrades.push({
          timestamp: trade.timestamp,
          asset: ticker,
          side: 'SELL', // Round-trip closes on sell
          quantity: matchQty,
          entry_price: entryPrice,
          exit_price: exitPrice,
          profit_loss: profitLoss,
        });

        remainingSellQty -= matchQty;
        position.quantity -= matchQty;

        // Remove fully matched position
        if (position.quantity <= 0) {
          positions.shift();
        }
      }
    }
  }

  // Calculate running balance starting from INITIAL_BALANCE
  const INITIAL_BALANCE = 100000;
  let balance = INITIAL_BALANCE;

  // Build CSV content
  const headers = ['timestamp', 'asset', 'side', 'quantity', 'entry_price', 'exit_price', 'profit_loss', 'balance', 'CALC_BAL', 'H-I'];
  const rows = roundTripTrades.map(trade => {
    balance += trade.profit_loss;
    const calcBal = balance; // Same as balance for our purposes
    const hI = 0; // Placeholder, not needed for analysis

    // Format timestamp to match expected format: "M/D/YYYY H:mm"
    const date = new Date(trade.timestamp);
    const formattedTimestamp = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

    return [
      formattedTimestamp,
      trade.asset,
      trade.side,
      trade.quantity,
      trade.entry_price.toFixed(2),
      trade.exit_price.toFixed(2),
      trade.profit_loss.toFixed(2),
      balance.toFixed(2),
      calcBal.toFixed(2),
      hI,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function LogUpload({ onAnalyze }: LogUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzingAccount, setAnalyzingAccount] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trades = useTradingStore((state) => state.trades);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      toast.success(`Uploaded: ${file.name}`);
    }
  };

  const handleAnalyzeUploaded = async () => {
    if (!uploadedFile) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const res = await fetch(`${API_BASE}/agent/analyze`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Analysis failed');
        return;
      }

      toast.success('Analysis complete!');
      onAnalyze('uploaded', data as AgentAnalysisResult);
    } catch (err) {
      toast.error('Could not reach the backend. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeAccount = async () => {
    // Check if we have enough trades to analyze
    const filledTrades = trades.filter(t => t.status === 'filled');
    if (filledTrades.length < 4) {
      toast.error('Need at least 4 filled trades to analyze. Place more trades first!');
      return;
    }

    // Count round-trip trades (buy+sell pairs)
    const buyCount = filledTrades.filter(t => t.type === 'buy').length;
    const sellCount = filledTrades.filter(t => t.type === 'sell').length;
    const minPairs = Math.min(buyCount, sellCount);

    if (minPairs < 2) {
      toast.error('Need at least 2 complete round-trip trades (buy + sell pairs) to analyze.');
      return;
    }

    setAnalyzingAccount(true);
    try {
      // Convert trades to CSV format
      const csvContent = convertTradesToCSV(trades);

      // Create a blob and form data
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'account_trades.csv', { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/agent/analyze`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Analysis failed');
        return;
      }

      toast.success('Account analysis complete!');
      onAnalyze('account', data as AgentAnalysisResult);
    } catch (err) {
      toast.error('Could not reach the backend. Is the server running?');
    } finally {
      setAnalyzingAccount(false);
    }
  };

  // Calculate number of analyzable trades for display
  const filledTrades = trades.filter(t => t.status === 'filled');
  const buyCount = filledTrades.filter(t => t.type === 'buy').length;
  const sellCount = filledTrades.filter(t => t.type === 'sell').length;
  const roundTripCount = Math.min(buyCount, sellCount);

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Upload Trade Logs</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a CSV trade log to analyze for behavioral patterns.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="hidden"
        />

        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl p-8 hover:border-primary/50 hover:bg-accent/30 transition-all flex flex-col items-center gap-2"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Click to upload CSV</span>
        </button>

        <AnimatePresence>
          {uploadedFile && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm">{uploadedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(uploadedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button onClick={() => setUploadedFile(null)}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {uploadedFile && (
          <Button
            className="w-full mt-3 bg-primary text-primary-foreground"
            onClick={handleAnalyzeUploaded}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Uploaded Logs'
            )}
          </Button>
        )}
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-2">Analyze Account Trades</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Run behavior analysis on trades from your paper trading account.
        </p>

        {/* Show trade stats */}
        <div className="flex items-center gap-2 mb-4 p-2 bg-muted/50 rounded-lg">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted-foreground">
            {roundTripCount > 0
              ? `${roundTripCount} round-trip trade${roundTripCount !== 1 ? 's' : ''} available for analysis`
              : 'No complete trades yet. Buy and sell to create round-trips!'}
          </span>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleAnalyzeAccount}
          disabled={analyzingAccount || roundTripCount < 2}
        >
          {analyzingAccount ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing Account Trades...
            </>
          ) : (
            'Analyze My Trades'
          )}
        </Button>
      </div>
    </div>
  );
}

