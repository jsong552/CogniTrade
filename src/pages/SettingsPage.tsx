import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useTradingStore } from '@/lib/tradingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { RotateCcw, AlertTriangle, DollarSign, Wallet } from 'lucide-react';

const SettingsPage = () => {
  const { balance, positions, pendingOrders, trades, watchlist, resetAccountWithBalance, getPortfolioValue, getTotalPnl } = useTradingStore();

  const [newBalance, setNewBalance] = useState('100000');
  const [showConfirmation, setShowConfirmation] = useState(false);

  const portfolioValue = getPortfolioValue();
  const totalPnl = getTotalPnl();
  const pendingOrdersCount = pendingOrders.filter(o => o.status === 'pending').length;
  const filledTradesCount = trades.length;
  const positionsCount = positions.length;

  const handleResetClick = () => {
    const amount = parseFloat(newBalance);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }
    setShowConfirmation(true);
  };

  const handleConfirmReset = () => {
    const amount = parseFloat(newBalance);
    resetAccountWithBalance(amount);
    setShowConfirmation(false);
    toast.success(`Account reset with $${amount.toLocaleString()} starting balance`);
  };

  const handleCancelReset = () => {
    setShowConfirmation(false);
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-xl font-bold">Settings</h1>

        {/* Account Summary */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Account Summary
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Portfolio Value</div>
              <div className="text-lg font-mono font-semibold">
                ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cash Balance</div>
              <div className="text-lg font-mono font-semibold">
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total P&L</div>
              <div className={`text-lg font-mono font-semibold ${totalPnl >= 0 ? 'text-gain' : 'text-loss'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Open Positions</div>
              <div className="text-lg font-mono font-semibold">{positionsCount}</div>
            </div>
          </div>
        </div>

        {/* Reset Account */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Reset Paper Trading Account
          </h3>

          <p className="text-xs text-muted-foreground">
            Start fresh with a new paper trading balance. Your watchlist will be preserved.
          </p>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Starting Balance ($)</Label>
            <Input
              type="number"
              min="1"
              step="1000"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              className="bg-muted border-border font-mono"
              placeholder="100000"
            />
          </div>

          {!showConfirmation ? (
            <Button
              variant="destructive"
              onClick={handleResetClick}
              className="w-full gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Account
            </Button>
          ) : (
            <div className="space-y-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-destructive mb-2">Are you sure?</p>
                  <p className="text-muted-foreground mb-2">This action will:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Remove all {filledTradesCount} trade logs</li>
                    <li>Cancel and remove all {pendingOrdersCount} pending orders</li>
                    <li>Close all {positionsCount} open positions</li>
                    <li>Set your balance to ${parseFloat(newBalance).toLocaleString()}</li>
                  </ul>
                  <p className="text-xs text-foreground mt-2 font-medium">
                    ✓ Your watchlist ({watchlist.length} symbols) will be preserved
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancelReset}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmReset}
                  className="flex-1"
                >
                  Yes, Reset Account
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Data Persistence Info */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-2">Data Persistence</h3>
          <p className="text-xs text-muted-foreground">
            All your data (trades, positions, watchlist, pending orders) is automatically saved to your browser's local storage.
            Your data will persist across page refreshes and browser sessions.
          </p>
        </div>

        {/* API Configuration */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-2">API Configuration</h3>
          <p className="text-xs text-muted-foreground mb-2">
            This app uses the Alpaca Markets API for real-time stock data.
            API keys are configured in the <code className="bg-muted px-1 py-0.5 rounded">.env</code> file.
          </p>
          <div className="text-xs text-muted-foreground/70">
            <code>VITE_ALPACA_API_KEY</code> and <code>VITE_ALPACA_SECRET_KEY</code>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
