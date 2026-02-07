import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import type { TimeRange, PricePoint } from '@/lib/mockData';
import { getHistoricalPricePoints } from '@/lib/transactionData';

const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '1Y'];

interface StockChartProps {
  symbol: string;
  basePrice: number;
  change: number;
}

export function StockChart({ symbol, basePrice, change }: StockChartProps) {
  const [range, setRange] = useState<TimeRange>('1D');
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load historical data from mock transactions
  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const pricePoints = getHistoricalPricePoints(symbol, range);
      setData(pricePoints);
      if (pricePoints.length === 0) {
        setError('No data available');
      }
    } catch (err) {
      console.warn(`Failed to load mock data for ${symbol}:`, err);
      setError('No data available');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, range]);


  const latestPrice = data.length > 0 ? data[data.length - 1].price : null;
  const firstPrice = data.length > 0 ? data[0].price : null;
  const derivedChange = latestPrice !== null && firstPrice !== null ? latestPrice - firstPrice : null;
  const derivedChangePercent =
    latestPrice !== null && firstPrice !== null
      ? ((latestPrice - firstPrice) / firstPrice) * 100
      : null;

  const displayPrice = latestPrice;
  const displayChange = derivedChange;
  const displayChangePercent = derivedChangePercent;

  const isPositive = displayChange !== null ? displayChange >= 0 : change >= 0;
  const strokeColor = isPositive ? 'hsl(145, 100%, 39%)' : 'hsl(0, 72%, 51%)';
  const fillId = `gradient-${symbol}`;

  const minPrice = data.length > 0 ? Math.min(...data.map(d => d.price)) : basePrice * 0.95;
  const maxPrice = data.length > 0 ? Math.max(...data.map(d => d.price)) : basePrice * 1.05;
  const padding = (maxPrice - minPrice) * 0.1;

  return (
    <div className="w-full">
      <div className="mb-6">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold font-mono">
            {displayPrice !== null ? `$${displayPrice.toFixed(2)}` : '—'}
          </span>
          <span className={`text-sm font-medium font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
            {displayChange !== null && displayChangePercent !== null
              ? `${isPositive ? '+' : ''}${displayChange.toFixed(2)} (${isPositive ? '+' : ''}${displayChangePercent.toFixed(2)}%)`
              : '—'}
          </span>
          {error && (
            <span className="text-xs text-yellow-500">({error})</span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={range}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-[280px] w-full min-w-0 min-h-[280px] relative"
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(220, 10%, 50%)' }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                domain={[minPrice - padding, maxPrice + padding]}
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
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-1 mt-4">
        {TIME_RANGES.map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              range === r
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
