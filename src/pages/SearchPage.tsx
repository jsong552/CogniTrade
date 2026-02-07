import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AlpacaMarketChart } from '@/components/AlpacaMarketChart';
import { useTradingStore } from '@/lib/tradingStore';
import { motion } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
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
                <h1 className="text-xl font-bold mb-6">Search Stocks</h1>

                {/* Main Chart Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="glass-card p-6"
                >
                    {/* Search Bar - Now at the top */}
                    <AlpacaMarketChart
                        symbol={currentSymbol}
                        onSymbolChange={handleSymbolChange}
                        showSymbolInput={true}
                    />

                    {/* Ticker Name and Add to Watchlist Button - Now below search */}
                    <div className="flex items-center justify-between mt-6 pt-6 border-t border-border/50">
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
