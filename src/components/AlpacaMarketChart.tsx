import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, Clock } from 'lucide-react';

interface BarData {
    time: string;
    price: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface AlpacaBar {
    t: string;  // timestamp
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
    v: number;  // volume
    n: number;  // trade count
    vw: number; // vwap
}

type TimeRange = '1D' | '1W' | '1M' | '1Y' | '5Y';

interface AlpacaMarketChartProps {
    symbol?: string;
    showSymbolInput?: boolean;
    compact?: boolean;
    onSymbolChange?: (symbol: string) => void;
}

// Get API keys from environment variables
const ALPACA_API_KEY = import.meta.env.VITE_ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = import.meta.env.VITE_ALPACA_SECRET_KEY || '';
const ALPACA_DATA_URL = 'https://data.alpaca.markets/v2';
const TRADING_TIMEZONE = 'America/New_York';

const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '1Y', '5Y'];

// Get timeframe and date range based on selected time range
function getTimeframeConfig(range: TimeRange): { timeframe: string; start: Date; end: Date } {
    const now = new Date();
    const end = now;
    let start: Date;
    let timeframe: string;

    switch (range) {
        case '1D':
            // Pull a wider window so we can trim to the most recent trading day.
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            timeframe = '5Min';
            break;
        case '1W':
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            timeframe = '30Min';
            break;
        case '1M':
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            timeframe = '1Hour';
            break;
        case '1Y':
            start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            timeframe = '1Day';
            break;
        case '5Y':
            start = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
            timeframe = '1Week';
            break;
        default:
            start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            timeframe = '5Min';
    }

    return { timeframe, start, end };
}

function getTradingDateKey(date: Date): string {
    return date.toLocaleDateString('en-US', {
        timeZone: TRADING_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// Format time based on range
function formatTime(date: Date, range: TimeRange): string {
    switch (range) {
        case '1D':
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        case '1W':
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                hour: '2-digit',
                hour12: true
            });
        case '1M':
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        case '1Y':
        case '5Y':
            return date.toLocaleDateString('en-US', {
                month: 'short',
                year: '2-digit'
            });
        default:
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}

export function AlpacaMarketChart({
    symbol = 'TSLA',
    showSymbolInput = true,
    compact = false,
    onSymbolChange
}: AlpacaMarketChartProps) {
    const [range, setRange] = useState<TimeRange>('1D');
    const [data, setData] = useState<BarData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [inputSymbol, setInputSymbol] = useState(symbol);
    const [activeSymbol, setActiveSymbol] = useState(symbol);
    const [priceStats, setPriceStats] = useState<{ open: number; high: number; low: number; close: number } | null>(null);

    // Update active symbol when prop changes
    useEffect(() => {
        setActiveSymbol(symbol);
        setInputSymbol(symbol);
    }, [symbol]);

    const fetchMarketData = useCallback(async (tickerSymbol: string, selectedRange: TimeRange) => {
        if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
            setError('API keys not configured. Please set VITE_ALPACA_API_KEY and VITE_ALPACA_SECRET_KEY in .env file.');
            setLoading(false);
            return;
        }

        try {
            const { timeframe, start, end } = getTimeframeConfig(selectedRange);

            const startStr = start.toISOString();
            const endStr = end.toISOString();

            // Try fetching with different feeds
            const feeds = ['sip', 'iex'];
            let allBars: AlpacaBar[] = [];

            for (const feed of feeds) {
                try {
                    const url = `${ALPACA_DATA_URL}/stocks/${tickerSymbol}/bars?timeframe=${timeframe}&start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}&limit=1000&adjustment=raw&feed=${feed}`;

                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'APCA-API-KEY-ID': ALPACA_API_KEY,
                            'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
                            'Accept': 'application/json',
                        },
                    });

                    if (response.ok) {
                        const result = await response.json();
                        const bars: AlpacaBar[] = result.bars || [];
                        if (bars.length > allBars.length) {
                            allBars = bars;
                        }
                    }
                } catch {
                    // Try next feed
                }
            }

            if (allBars.length === 0) {
                setError('No market data available for this symbol.');
                setData([]);
                setPriceStats(null);
            } else {
                if (selectedRange === '1D') {
                    const lastBarDateKey = getTradingDateKey(new Date(allBars[allBars.length - 1].t));
                    allBars = allBars.filter(bar => getTradingDateKey(new Date(bar.t)) === lastBarDateKey);
                }

                // Transform the data for the chart
                let minPrice = Infinity;
                let maxPrice = -Infinity;
                let firstPrice = 0;
                let lastPrice = 0;

                const chartData: BarData[] = allBars.map((bar: AlpacaBar, index: number) => {
                    const date = new Date(bar.t);

                    if (index === 0) firstPrice = bar.o;
                    lastPrice = bar.c;
                    minPrice = Math.min(minPrice, bar.l);
                    maxPrice = Math.max(maxPrice, bar.h);

                    return {
                        time: formatTime(date, selectedRange),
                        price: bar.c,
                        open: bar.o,
                        high: bar.h,
                        low: bar.l,
                        close: bar.c,
                        volume: bar.v,
                    };
                });

                setData(chartData);
                setPriceStats({
                    open: firstPrice,
                    high: maxPrice,
                    low: minPrice,
                    close: lastPrice,
                });
                setError(null);
            }

            setLastRefresh(new Date());
            setActiveSymbol(tickerSymbol);
        } catch (err) {
            console.error('Failed to fetch Alpaca market data:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch market data');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load and when range changes
    useEffect(() => {
        setLoading(true);
        fetchMarketData(activeSymbol, range);
    }, [activeSymbol, range, fetchMarketData]);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            fetchMarketData(activeSymbol, range);
        }, 5000);

        return () => clearInterval(interval);
    }, [activeSymbol, range, fetchMarketData]);

    const handleSymbolSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedSymbol = inputSymbol.trim().toUpperCase();
        if (trimmedSymbol && trimmedSymbol !== activeSymbol) {
            setLoading(true);
            setData([]);
            setActiveSymbol(trimmedSymbol);
            onSymbolChange?.(trimmedSymbol);
        }
    };

    const handleRefresh = () => {
        setLoading(true);
        fetchMarketData(activeSymbol, range);
    };

    // Calculate price change
    const latestPrice = data.length > 0 ? data[data.length - 1].price : null;
    const firstPrice = data.length > 0 ? data[0].price : null;
    const priceChange = latestPrice !== null && firstPrice !== null ? latestPrice - firstPrice : null;
    const changePercent = latestPrice !== null && firstPrice !== null && firstPrice !== 0
        ? ((latestPrice - firstPrice) / firstPrice) * 100
        : null;

    const isPositive = priceChange !== null ? priceChange >= 0 : true;
    const strokeColor = isPositive ? 'hsl(145, 100%, 39%)' : 'hsl(0, 72%, 51%)';
    const fillId = `alpaca-gradient-${activeSymbol}-${range}`;

    // Calculate Y-axis domain
    const prices = data.map(d => d.price);
    const minPriceVal = prices.length > 0 ? Math.min(...prices) : 100;
    const maxPriceVal = prices.length > 0 ? Math.max(...prices) : 100;
    const padding = (maxPriceVal - minPriceVal) * 0.15 || 1;

    return (
        <div className="w-full">
            {/* Header with Symbol Input */}
            {showSymbolInput && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <form onSubmit={handleSymbolSubmit} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={inputSymbol}
                                onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
                                placeholder="Enter symbol..."
                                className="w-32 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 uppercase"
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                Search
                            </button>
                        </form>
                        <button
                            onClick={handleRefresh}
                            disabled={loading}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                            title="Refresh data"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Auto-updates every 5s
                        </span>
                        {lastRefresh && (
                            <span className="text-xs text-muted-foreground">
                                Last: {lastRefresh.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Price Display */}
            <div className={compact ? "mb-4" : "mb-6"}>
                <div className="flex items-baseline gap-3">
                    <span className={`font-bold font-mono ${compact ? 'text-2xl' : 'text-3xl'}`}>
                        {latestPrice !== null ? `$${latestPrice.toFixed(2)}` : '—'}
                    </span>
                    {priceChange !== null && changePercent !== null && (
                        <span className={`flex items-center gap-1 text-sm font-medium font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
                            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                            {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                        </span>
                    )}
                    {!showSymbolInput && (
                        <button
                            onClick={handleRefresh}
                            disabled={loading}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 ml-auto"
                            title="Refresh data"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Chart */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`${activeSymbol}-${range}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`w-full min-w-0 relative ${compact ? 'h-[220px] min-h-[220px]' : 'h-[280px] min-h-[280px]'}`}
                >
                    {loading && data.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 rounded-lg">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <RefreshCw className="h-5 w-5 animate-spin" />
                                <span>Loading market data...</span>
                            </div>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="flex flex-col items-center gap-3 text-center p-6">
                                <div className="p-3 bg-destructive/10 rounded-full">
                                    <AlertCircle className="h-6 w-6 text-destructive" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground mb-1">Unable to load data</p>
                                    <p className="text-xs text-muted-foreground max-w-xs">{error}</p>
                                </div>
                                <button
                                    onClick={handleRefresh}
                                    className="mt-2 px-4 py-2 bg-secondary hover:bg-accent text-sm rounded-lg transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    )}

                    {!error && data.length > 0 && (
                        <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
                            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                <defs>
                                    <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
                                        <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="time"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: 'hsl(220, 10%, 50%)' }}
                                    interval="preserveStartEnd"
                                    minTickGap={compact ? 60 : 80}
                                />
                                <YAxis
                                    domain={[minPriceVal - padding, maxPriceVal + padding]}
                                    hide
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(220, 18%, 9%)',
                                        border: '1px solid hsl(220, 14%, 18%)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontFamily: 'JetBrains Mono, monospace',
                                    }}
                                    labelStyle={{ color: 'hsl(220, 10%, 50%)' }}
                                    itemStyle={{ color: strokeColor }}
                                    formatter={(value: number | string | undefined) => {
                                        const numericValue = typeof value === 'number' ? value : Number(value);
                                        return Number.isFinite(numericValue)
                                            ? [`$${numericValue.toFixed(2)}`, 'Price']
                                            : ['—', 'Price'];
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="price"
                                    stroke={strokeColor}
                                    strokeWidth={2}
                                    fill={`url(#${fillId})`}
                                    dot={false}
                                    activeDot={{ r: 4, fill: strokeColor, strokeWidth: 0 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Time Range Buttons */}
            <div className="flex gap-1 mt-4">
                {TIME_RANGES.map(r => (
                    <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${range === r
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            }`}
                    >
                        {r}
                    </button>
                ))}
            </div>

            {/* Stats */}
            {priceStats && !compact && (
                <div className="mt-6 pt-4 border-t border-border/50">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                            <span className="text-xs text-muted-foreground block mb-1">Open</span>
                            <span className="font-mono text-sm">${priceStats.open.toFixed(2)}</span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block mb-1">High</span>
                            <span className="font-mono text-sm text-gain">${priceStats.high.toFixed(2)}</span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block mb-1">Low</span>
                            <span className="font-mono text-sm text-loss">${priceStats.low.toFixed(2)}</span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground block mb-1">Close</span>
                            <span className="font-mono text-sm">${priceStats.close.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* API Attribution */}
            {!compact && (
                <div className="mt-4 text-center">
                    <span className="text-xs text-muted-foreground/60">
                        Data provided by Alpaca Markets API • Updates every 5 seconds
                    </span>
                </div>
            )}
        </div>
    );
}
