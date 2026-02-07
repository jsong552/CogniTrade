import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AlpacaMarketChart } from '@/components/AlpacaMarketChart';
import { useTradingStore } from '@/lib/tradingStore';
import { motion } from 'framer-motion';
import { Search, Zap, Globe, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';

const SearchPage = () => {
    const [currentSymbol, setCurrentSymbol] = useState('TSLA');
    const { addToWatchlist, isInWatchlist, watchlist } = useTradingStore();

    const inWatchlist = isInWatchlist(currentSymbol);

    const handleAddToWatchlist = () => {
        if (!inWatchlist) {
            addToWatchlist(currentSymbol);
            toast.success(`${currentSymbol} added to watchlist`);
        }
    };

    // Custom callback when symbol changes in the chart
    const handleSymbolChange = (symbol: string) => {
        setCurrentSymbol(symbol.toUpperCase());
    };

    return (
        <AppLayout>
            <div className="space-y-6">
                {/* Page Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border border-primary/20">
                            <Search className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight">Search Stocks</h1>
                            <p className="text-sm text-muted-foreground">Real-time stock prices from Alpaca Markets</p>
                        </div>
                    </div>
                </motion.div>

                {/* Feature Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                    <div className="glass-card p-4 flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Globe className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                            <span className="text-sm font-medium">US Markets</span>
                            <p className="text-xs text-muted-foreground">NYSE & NASDAQ</p>
                        </div>
                    </div>
                    <div className="glass-card p-4 flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                            <Zap className="h-4 w-4 text-amber-400" />
                        </div>
                        <div>
                            <span className="text-sm font-medium">Live Data</span>
                            <p className="text-xs text-muted-foreground">Updates every 5 seconds</p>
                        </div>
                    </div>
                    <div className="glass-card p-4 flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <Search className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                            <span className="text-sm font-medium">Watchlist: {watchlist.length}</span>
                            <p className="text-xs text-muted-foreground">Stocks tracked</p>
                        </div>
                    </div>
                </motion.div>

                {/* Main Chart Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="glass-card p-6"
                >
                    {/* Add to Watchlist Button */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">{currentSymbol}</span>
                        </div>
                        <button
                            onClick={handleAddToWatchlist}
                            disabled={inWatchlist}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${inWatchlist
                                    ? 'bg-gain/10 text-gain cursor-default'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                }`}
                        >
                            {inWatchlist ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    In Watchlist
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4" />
                                    Add to Watchlist
                                </>
                            )}
                        </button>
                    </div>

                    <AlpacaMarketChart
                        symbol={currentSymbol}
                        onSymbolChange={handleSymbolChange}
                    />
                </motion.div>

                {/* Info Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                    className="glass-card p-5"
                >
                    <h3 className="text-sm font-semibold mb-3">How It Works</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p>
                            <strong className="text-foreground">1. Search:</strong> Enter any valid US stock symbol (e.g., AAPL, MSFT, GOOGL) to view its price history.
                        </p>
                        <p>
                            <strong className="text-foreground">2. Add to Watchlist:</strong> Click "Add to Watchlist" to track this stock on your Trade page.
                        </p>
                        <p>
                            <strong className="text-foreground">3. Trade:</strong> Go to the Trade page to buy/sell stocks from your watchlist with market or limit orders.
                        </p>
                    </div>
                </motion.div>
            </div>
        </AppLayout>
    );
};

export default SearchPage;
