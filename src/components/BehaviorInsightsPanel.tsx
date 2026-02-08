import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Flame,
  AlertTriangle,
  TrendingUp,
  Target,
  BarChart3,
  Lightbulb,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { type BiasModelResult } from '@/components/LogUpload';

const PROB_KEYS = {
  overtrading: 'overtrading_prob',
  revenge: 'revenge_prob',
  loss_aversion: 'loss_aversion_prob',
} as const;

type ModelKey = keyof typeof PROB_KEYS;

const MODEL_META: Record<
  ModelKey,
  { label: string; color: string; icon: React.ReactNode; suggestion: string }
> = {
  overtrading: {
    label: 'Overtrading',
    color: 'hsl(217, 91%, 60%)',
    icon: <Activity className="h-4 w-4 text-blue-400" />,
    suggestion: 'Set a max trades-per-session limit and take breaks after hitting it.',
  },
  revenge: {
    label: 'Revenge Trading',
    color: 'hsl(25, 95%, 53%)',
    icon: <Flame className="h-4 w-4 text-orange-400" />,
    suggestion: 'After a loss, step away for at least 15 minutes before trading again.',
  },
  loss_aversion: {
    label: 'Loss Aversion',
    color: 'hsl(45, 93%, 58%)',
    icon: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
    suggestion: 'Use predefined stop-loss and take-profit levels to reduce emotional exits.',
  },
};

function getProbSeries(result: BiasModelResult, scoreKey: string): number[] {
  const rows = result.feature_data ?? [];
  return rows.map((row) => {
    const v = row[scoreKey];
    return typeof v === 'number' ? v : 0;
  });
}

function riskBuckets(probs: number[]) {
  let low = 0;
  let medium = 0;
  let high = 0;
  for (const p of probs) {
    if (p >= 0.65) high++;
    else if (p >= 0.35) medium++;
    else low++;
  }
  const n = probs.length;
  return {
    low: n ? (low / n) * 100 : 0,
    medium: n ? (medium / n) * 100 : 0,
    high: n ? (high / n) * 100 : 0,
    lowCount: low,
    mediumCount: medium,
    highCount: high,
  };
}

interface BehaviorInsightsPanelProps {
  scores: {
    overtrading: BiasModelResult;
    revenge: BiasModelResult;
    loss_aversion: BiasModelResult;
  };
}

export function BehaviorInsightsPanel({ scores }: BehaviorInsightsPanelProps) {
  const { timeSeriesData, distributionData, kpis, insights } = useMemo(() => {
    const keys: ModelKey[] = ['overtrading', 'revenge', 'loss_aversion'];
    const maxLen = Math.max(
      scores.overtrading.feature_data?.length ?? 0,
      scores.revenge.feature_data?.length ?? 0,
      scores.loss_aversion.feature_data?.length ?? 0
    );

    const timeSeriesData = Array.from({ length: maxLen }, (_, i) => {
      const point: Record<string, number> = { index: i + 1 };
      keys.forEach((k) => {
        const probs = getProbSeries(scores[k], PROB_KEYS[k]);
        point[MODEL_META[k].label] = probs[i] !== undefined ? Math.round(probs[i] * 100) : 0;
      });
      return point;
    });

    const distributionData = keys.map((k) => {
      const probs = getProbSeries(scores[k], PROB_KEYS[k]);
      const b = riskBuckets(probs);
      return {
        model: MODEL_META[k].label,
        Low: b.lowCount,
        Medium: b.mediumCount,
        High: b.highCount,
        lowPct: b.low,
        mediumPct: b.medium,
        highPct: b.high,
        avg: scores[k].avg_score,
        peak: probs.length ? Math.max(...probs) : 0,
        total: probs.length,
      };
    });

    const kpis = keys.map((k) => {
      const probs = getProbSeries(scores[k], PROB_KEYS[k]);
      const b = riskBuckets(probs);
      return {
        key: k,
        label: MODEL_META[k].label,
        avg: scores[k].avg_score,
        peak: probs.length ? Math.max(...probs) : 0,
        highPct: b.high,
        mediumPct: b.medium,
        lowPct: b.low,
        highCount: b.highCount,
        total: probs.length,
      };
    });

    const insights = kpis.map((k) => {
      const meta = MODEL_META[k.key as ModelKey];
      const highPct = Math.round(k.highPct);
      const avgPct = Math.round(k.avg * 100);
      let action = '';
      if (k.highPct >= 25) {
        action = `${highPct}% of windows showed high risk. ${meta.suggestion}`;
      } else if (k.avg >= 0.5) {
        action = `Average risk at ${avgPct}%. ${meta.suggestion}`;
      } else {
        action = `Pattern is mostly under control (${k.lowPct.toFixed(0)}% low risk). Keep current discipline.`;
      }
      return { label: meta.label, action, severity: k.highPct >= 25 ? 'high' : k.avg >= 0.35 ? 'medium' : 'low' };
    });

    return { timeSeriesData, distributionData, kpis, insights };
  }, [scores]);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map((k, i) => (
          <motion.div
            key={k.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-lg border border-border bg-muted/20 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              {MODEL_META[k.key as ModelKey].icon}
              <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums">
                {(k.avg * 100).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">avg risk</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="text-gain">Low: {k.lowPct.toFixed(0)}%</span>
              <span className="text-yellow-400">Med: {k.mediumPct.toFixed(0)}%</span>
              <span className="text-loss">High: {k.highPct.toFixed(0)}%</span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Peak {((k.peak as number) * 100).toFixed(0)}% · {k.total} windows
            </div>
          </motion.div>
        ))}
      </div>

      {/* Probability over time */}
      <div className="rounded-lg border border-border bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Risk Over Time (by window)</h4>
        </div>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeriesData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="index"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `#${v}`}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 11,
                }}
                labelFormatter={(v) => `Window ${v}`}
                formatter={(value: number, name: string) => [`${value}%`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="Overtrading"
                stroke="hsl(217, 91%, 60%)"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Revenge Trading"
                stroke="hsl(25, 95%, 53%)"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Loss Aversion"
                stroke="hsl(45, 93%, 58%)"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risk distribution (stacked bar per model) */}
      <div className="rounded-lg border border-border bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Risk Distribution (windows by bucket)</h4>
        </div>
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={distributionData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="model"
                width={58}
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 11,
                }}
                formatter={(value: number, name: string) => [`${value} windows`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Low" stackId="a" fill="hsl(var(--gain))" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Medium" stackId="a" fill="hsl(45, 93%, 58%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="High" stackId="a" fill="hsl(var(--loss))" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Actionable insights */}
      <div className="rounded-lg border border-border bg-muted/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Actionable Insights</h4>
        </div>
        <ul className="space-y-2">
          {insights.map((item, i) => (
            <motion.li
              key={item.label}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              className="flex gap-2 text-xs"
            >
              <Lightbulb
                className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${
                  item.severity === 'high'
                    ? 'text-loss'
                    : item.severity === 'medium'
                      ? 'text-yellow-400'
                      : 'text-gain'
                }`}
              />
              <span className="font-medium text-muted-foreground">{item.label}:</span>
              <span className="text-foreground/90">{item.action}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
