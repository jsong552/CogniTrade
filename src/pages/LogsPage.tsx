import { AppLayout } from '@/components/AppLayout';
import { TradeLog } from '@/components/TradeLog';
import { useTradingStore } from '@/lib/tradingStore';

const LogsPage = () => {
  const { trades } = useTradingStore();

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold mb-6">Trade Logs</h1>
        <div className="glass-card p-5">
          <TradeLog trades={trades} />
        </div>
      </div>
    </AppLayout>
  );
};

export default LogsPage;
