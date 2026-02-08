import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Table2, Activity, Flame, AlertTriangle, BarChart3, Info } from 'lucide-react';
import { type BiasModelResult } from '@/components/LogUpload';
import { BehaviorInsightsPanel } from '@/components/BehaviorInsightsPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getFeatureTooltip } from '@/lib/mlFeatureGlossary';

interface ModelSectionProps {
  title: string;
  icon: React.ReactNode;
  result: BiasModelResult;
  scoreKey: string;
}

function ModelSection({ title, icon, result, scoreKey }: ModelSectionProps) {
  const [open, setOpen] = useState(false);
  const rows = result.feature_data ?? [];
  const cols = result.feature_columns ?? [];

  if (cols.length === 0) return null;

  return (
    <div className="border border-border rounded-lg min-w-0 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {rows.length} rows x {cols.length} features
          &nbsp;&middot;&nbsp;avg {scoreKey}: {(result.avg_score * 100).toFixed(2)}%
        </span>
      </button>

      {/* Table: scroll both axes so wide tables are fully visible */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="min-w-0 w-full"
          >
            <div className="max-h-[350px] min-w-0 w-full overflow-auto">
              <TooltipProvider delayDuration={300}>
                <table className="w-full min-w-max text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-muted/60 sticky top-0">
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">#</th>
                      {cols.map((col) => {
                        const { label, definition } = getFeatureTooltip(col);
                        return (
                          <th
                            key={col}
                            className="px-2 py-1.5 text-left text-muted-foreground font-medium whitespace-nowrap"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-help items-center gap-1 border-b border-dotted border-muted-foreground/50">
                                  {col}
                                  <Info className="h-3 w-3 shrink-0 opacity-60" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[280px] text-left">
                                <div className="font-semibold text-foreground">{label}</div>
                                <p className="mt-1 text-muted-foreground">{definition}</p>
                              </TooltipContent>
                            </Tooltip>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-t border-border/50 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        {cols.map((col) => {
                          const val = row[col];
                          const isProb = col.endsWith('_prob');
                          const numVal = typeof val === 'number' ? val : NaN;
                          return (
                            <td
                              key={col}
                              className={`px-2 py-1 whitespace-nowrap ${
                                isProb
                                  ? numVal >= 0.65
                                    ? 'text-loss font-semibold'
                                    : numVal >= 0.35
                                    ? 'text-yellow-400 font-semibold'
                                    : 'text-gain'
                                  : ''
                              }`}
                            >
                              {typeof val === 'number'
                                ? isProb
                                  ? (val * 100).toFixed(2) + '%'
                                  : val.toFixed(4)
                                : String(val ?? 'NaN')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TooltipProvider>
            </div>
            {rows.length >= 200 && (
              <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border/50">
                Showing first 200 of {result.windows.length} rows
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FeatureDataPanelProps {
  scores: {
    overtrading: BiasModelResult;
    revenge: BiasModelResult;
    loss_aversion: BiasModelResult;
  };
}

export function FeatureDataPanel({ scores }: FeatureDataPanelProps) {
  const [showMLFeatures, setShowMLFeatures] = useState(true);

  return (
    <div className="glass-card p-5 space-y-5 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Behavior Insights & Metrics</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Charts and actionable metrics derived from your trading feature data.
      </p>

      <BehaviorInsightsPanel scores={scores} />

      {/* ML Feature Data & Probabilities (collapsible, shown by default) */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">ML Feature Data &amp; Probabilities</h4>
          </div>
          <button
            onClick={() => setShowMLFeatures(!showMLFeatures)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showMLFeatures ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showMLFeatures ? 'Collapse' : 'Expand'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Preprocessed features fed into each model, with predicted probability in the last column.
        </p>
        <AnimatePresence>
          {showMLFeatures && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-3">
                <ModelSection
                  title="Overtrading Model"
                  icon={<Activity className="h-4 w-4 text-blue-400" />}
                  result={scores.overtrading}
                  scoreKey="overtrading_prob"
                />
                <ModelSection
                  title="Revenge Trading Model"
                  icon={<Flame className="h-4 w-4 text-orange-400" />}
                  result={scores.revenge}
                  scoreKey="revenge_prob"
                />
                <ModelSection
                  title="Loss Aversion Model"
                  icon={<AlertTriangle className="h-4 w-4 text-yellow-400" />}
                  result={scores.loss_aversion}
                  scoreKey="loss_aversion_prob"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
