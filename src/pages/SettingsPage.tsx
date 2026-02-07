import { AppLayout } from '@/components/AppLayout';
import { useTradingStore } from '@/lib/tradingStore';
import { Button } from '@/components/ui/button';
import { INITIAL_BALANCE } from '@/lib/mockData';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';

const SettingsPage = () => {
  const { resetAccount, portfolioValue } = useTradingStore();

  const handleReset = () => {
    resetAccount();
    toast.success('Account reset to $' + INITIAL_BALANCE.toLocaleString());
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-6">Settings</h1>

        <div className="glass-card p-5 space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-1">Paper Trading Account</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Current portfolio value: ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <Button variant="destructive" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset Account to ${INITIAL_BALANCE.toLocaleString()}
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold mb-1">Authentication</h3>
            <p className="text-xs text-muted-foreground">
              Sign up / login functionality will be available once the backend is connected.
              Currently using local storage for data persistence.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
