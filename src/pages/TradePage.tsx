import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { StockChart } from '@/components/StockChart';
import { TickerList } from '@/components/TickerList';
import { TradePanel } from '@/components/TradePanel';
import { TICKERS } from '@/lib/mockData';
import type { StockTicker } from '@/lib/mockData';
import { useTradingStore } from '@/lib/tradingStore';

const TradePage = () => {
  const [selectedTicker, setSelectedTicker] = useState<StockTicker>(TICKERS[0]);
  const { balance, positions, placeTrade } = useTradingStore();

  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Watchlist */}
        <div className="lg:col-span-3">
          <TickerList selectedTicker={selectedTicker.symbol} onSelect={setSelectedTicker} />
        </div>

        {/* Chart */}
        <div className="lg:col-span-5">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold">{selectedTicker.symbol}</h2>
              <span className="text-xs text-muted-foreground">{selectedTicker.name}</span>
            </div>
            <StockChart
              symbol={selectedTicker.symbol}
              basePrice={selectedTicker.price}
              change={selectedTicker.change}
            />
          </div>
        </div>

        {/* Trade Panel */}
        <div className="lg:col-span-4">
          <TradePanel
            ticker={selectedTicker}
            balance={balance}
            positions={positions}
            onTrade={placeTrade}
          />
        </div>
      </div>
    </AppLayout>
  );
};

export default TradePage;
