import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Table2, Activity, Flame, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type BiasModelResult } from '@/components/LogUpload';

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
    <div className="border border-border rounded-lg overflow-hidden">
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

      {/* Table */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ScrollArea className="max-h-[350px]">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="bg-muted/60 sticky top-0">
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">#</th>
                      {cols.map((col) => (
                        <th
                          key={col}
                          className="px-2 py-1.5 text-left text-muted-foreground font-medium whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
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
              </div>
            </ScrollArea>
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
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Table2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Model Feature Data & Probabilities</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Preprocessed features fed into each ML model, with the raw predicted probability in the last column.
      </p>

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
  );
}
