import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AlpacaMarketChart } from '@/components/AlpacaMarketChart';
import { useTradingStore } from '@/lib/tradingStore';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, Clock, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  const {
    balance,
    positions,
    pendingOrders,
    trades,
    checkAndFillOrders,
    getPortfolioValue,
    getTotalPnl
  } = useTradingStore();

  const portfolioValue = getPortfolioValue();
  const totalPnl = getTotalPnl();
  const pendingOrdersCount = pendingOrders.filter(o => o.status === 'pending').length;
  const recentTrades = trades.slice(0, 5);

  // Check pending orders every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkAndFillOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [checkAndFillOrders]);

  // Pick a featured ticker from positions or default
  const [featuredTicker] = useState(() => {
    if (positions.length > 0) {
      return positions[0].ticker;
    }
    return 'SPY';
  });

  const pnlPercent = portfolioValue > 0 ? (totalPnl / (portfolioValue - totalPnl)) * 100 : 0;
  const isPositive = totalPnl >= 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your portfolio overview</p>
        </motion.div>

        {/* Portfolio Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Portfolio Value */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              <span>Portfolio Value</span>
            </div>
            <div className="text-2xl font-bold font-mono">
              ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className={`flex items-center gap-1 text-sm font-mono mt-1 ${isPositive ? 'text-gain' : 'text-loss'}`}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {isPositive ? '+' : ''}{totalPnl.toFixed(2)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(2)}%)
            </div>
          </div>

          {/* Cash Balance */}
          <div className="glass-card p-5">
            <div className="text-xs text-muted-foreground mb-1">Cash Available</div>
            <div className="text-2xl font-bold font-mono">
              ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {positions.length} open position{positions.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Pending Orders */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span>Pending Orders</span>
            </div>
            <div className="text-2xl font-bold font-mono">{pendingOrdersCount}</div>
            <Link to="/logs" className="text-xs text-primary hover:underline mt-1 block">
              View all orders →
            </Link>
          </div>

          {/* Total Trades */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" />
              <span>Total Trades</span>
            </div>
            <div className="text-2xl font-bold font-mono">{trades.length}</div>
            <Link to="/logs" className="text-xs text-primary hover:underline mt-1 block">
              View trade history →
            </Link>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="lg:col-span-8"
          >
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">{featuredTicker}</h2>
                  <span className="text-xs text-muted-foreground">Market Overview</span>
                </div>
                <Link
                  to="/trade"
                  className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Trade →
                </Link>
              </div>
              <AlpacaMarketChart
                symbol={featuredTicker}
                showSymbolInput={false}
                compact={true}
              />
            </div>
          </motion.div>

          {/* Positions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="lg:col-span-4"
          >
            <div className="glass-card p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Open Positions</h3>
                <Link to="/trade" className="text-xs text-primary hover:underline">
                  Manage →
                </Link>
              </div>

              {positions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-muted-foreground text-sm mb-2">No open positions</div>
                  <Link
                    to="/trade"
                    className="text-xs text-primary hover:underline"
                  >
                    Start trading →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {positions.map(pos => (
                    <div key={pos.ticker} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div>
                        <div className="font-semibold text-sm">{pos.ticker}</div>
                        <div className="text-xs text-muted-foreground">{pos.quantity} shares @ ${pos.avgPrice.toFixed(2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono">${pos.totalValue.toFixed(2)}</div>
                        <div className={`text-xs font-mono ${pos.pnl >= 0 ? 'text-gain' : 'text-loss'}`}>
                          {pos.pnl >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <Link to="/logs" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </div>

            {recentTrades.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No recent trades
              </div>
            ) : (
              <div className="space-y-2">
                {recentTrades.map(trade => (
                  <div key={trade.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-8 rounded-full ${trade.type === 'buy' ? 'bg-gain' : 'bg-loss'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{trade.ticker}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${trade.type === 'buy' ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'}`}>
                            {trade.type.toUpperCase()}
                          </span>
                          <span className="text-xs text-muted-foreground">{trade.orderType}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(trade.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono">{trade.quantity} × ${trade.price.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground font-mono">${trade.total.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default Index;
