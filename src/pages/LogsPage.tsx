import { AppLayout } from '@/components/AppLayout';
import { TradeLog } from '@/components/TradeLog';

const LogsPage = () => {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold mb-6">Trade Logs</h1>
        <div className="glass-card p-5">
          <TradeLog />
        </div>
      </div>
    </AppLayout>
  );
};

export default LogsPage;
