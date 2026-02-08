import { MOCK_BEHAVIOR_ANALYSIS, BehaviorAnalysis as BehaviorType } from '@/lib/mockData';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingDown, Flame, Activity, Anchor } from 'lucide-react';

const ICONS: Record<string, any> = {
  'FOMO Trading': TrendingDown,
  'Loss Aversion': AlertTriangle,
  'Revenge Trading': Flame,
  'Overtrading': Activity,
  'Anchoring Bias': Anchor,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-500/15 text-blue-400',
  medium: 'bg-yellow-500/15 text-yellow-400',
  high: 'bg-loss/15 text-loss',
};

interface BehaviorAnalysisProps {
  analysisData?: BehaviorType[];
}

export function BehaviorAnalysis({ analysisData }: BehaviorAnalysisProps) {
  const data = analysisData ?? MOCK_BEHAVIOR_ANALYSIS;

  const overallScore = Math.round(data.reduce((s, d) => s + d.score, 0) / data.length);

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-5 text-center"
      >
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Trading Discipline Score</div>
        <div className="text-5xl font-bold font-mono">
          <span className={overallScore >= 70 ? 'text-gain' : overallScore >= 40 ? 'text-yellow-400' : 'text-loss'}>
            {overallScore}
          </span>
          <span className="text-lg text-muted-foreground">/100</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Based on analysis of your trading patterns (example data)
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.map((item, i) => {
          const Icon = ICONS[item.pattern] || Activity;
          const percentage = Math.round(item.score);
          return (
            <motion.div
              key={item.pattern}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass-card p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{item.pattern}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[item.severity]}`}>
                    {item.severity}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{item.occurrences}×</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Estimated likelihood</span>
                <span className="text-foreground font-semibold">{percentage}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ delay: i * 0.08 + 0.3, duration: 0.5 }}
                  className={`h-full rounded-full ${
                    item.score >= 70 ? 'bg-loss' : item.score >= 40 ? 'bg-yellow-400' : 'bg-gain'
                  }`}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-3">{item.description}</p>
              <div className="bg-muted/50 rounded-lg p-2.5 mt-3">
                <span className="text-xs text-foreground/80">💡 {item.suggestion}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
