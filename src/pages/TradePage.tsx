import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AlpacaMarketChart } from '@/components/AlpacaMarketChart';
import { TickerList } from '@/components/TickerList';
import { TradePanel } from '@/components/TradePanel';
import { useTradingStore } from '@/lib/tradingStore';

interface TickerData {
  symbol: string;
  name: string;
  price: number;
  change?: number;
  changePercent?: number;
}

const TradePage = () => {
  const { watchlist, watchlistPrices, checkAndFillOrders } = useTradingStore();

  // Default to first ticker in watchlist
  const getDefaultTicker = (): TickerData => {
    const symbol = watchlist[0] || 'AAPL';
    const priceData = watchlistPrices[symbol];
    return {
      symbol,
      name: symbol,
      price: priceData?.price || 0,
    };
  };

  const [selectedTicker, setSelectedTicker] = useState<TickerData>(getDefaultTicker);
  const [chartKey, setChartKey] = useState(0);

  // Update selected ticker price from store
  useEffect(() => {
    const priceData = watchlistPrices[selectedTicker.symbol];
    if (priceData && priceData.price !== selectedTicker.price) {
      setSelectedTicker(prev => ({
        ...prev,
        price: priceData.price,
        change: priceData.change,
        changePercent: priceData.changePercent,
      }));
    }
  }, [watchlistPrices, selectedTicker.symbol, selectedTicker.price]);

  // Check pending orders every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkAndFillOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [checkAndFillOrders]);

  // Force chart refresh when ticker changes
  useEffect(() => {
    setChartKey(prev => prev + 1);
  }, [selectedTicker.symbol]);

  const handleTickerSelect = (ticker: TickerData) => {
    setSelectedTicker(ticker);
  };

  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Watchlist with remove button */}
        <div className="lg:col-span-3">
          <div className="glass-card p-4">
            <TickerList
              selectedTicker={selectedTicker.symbol}
              onSelect={handleTickerSelect}
              showRemoveButton={true}
            />
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-5">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold">{selectedTicker.symbol}</h2>
              <span className="text-xs text-muted-foreground">{selectedTicker.name}</span>
            </div>
            <AlpacaMarketChart
              key={chartKey}
              symbol={selectedTicker.symbol}
              showSymbolInput={false}
              compact={true}
            />
          </div>
        </div>

        {/* Trade Panel */}
        <div className="lg:col-span-4">
          <TradePanel ticker={selectedTicker} />
        </div>
      </div>
    </AppLayout>
  );
};

export default TradePage;
