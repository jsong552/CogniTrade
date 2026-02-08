import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { LogUpload, AgentAnalysisResult, BiasScores } from '@/components/LogUpload';
import { BehaviorAnalysis } from '@/components/BehaviorAnalysis';
import { FeatureDataPanel } from '@/components/FeatureDataPanel';
import { AgentChat } from '@/components/AgentChat';
import { BehaviorAnalysis as BehaviorType } from '@/lib/mockData';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

/** Map the three model scores into the BehaviorAnalysis card format. */
function toBehaviorCards(scores: BiasScores): BehaviorType[] {
  const toSeverity = (s: number): 'low' | 'medium' | 'high' =>
    s >= 0.65 ? 'high' : s >= 0.35 ? 'medium' : 'low';

  return [
    {
      pattern: 'Overtrading',
      description: `Avg probability: ${(scores.overtrading.avg_score * 100).toFixed(2)}% across ${scores.overtrading.windows.length} windows.`,
      severity: toSeverity(scores.overtrading.avg_score),
      occurrences: scores.overtrading.windows.length,
      suggestion: 'Set a maximum number of trades per session and take a break after reaching it.',
      score: Math.round(scores.overtrading.avg_score * 100),
    },
    {
      pattern: 'Revenge Trading',
      description: `Avg probability: ${(scores.revenge.avg_score * 100).toFixed(2)}% across ${scores.revenge.windows.length} post-loss events.`,
      severity: toSeverity(scores.revenge.avg_score),
      occurrences: scores.revenge.windows.length,
      suggestion: 'After a loss, step away for at least 15 minutes before placing another trade.',
      score: Math.round(scores.revenge.avg_score * 100),
    },
    {
      pattern: 'Loss Aversion',
      description: `Avg probability: ${(scores.loss_aversion.avg_score * 100).toFixed(2)}% across ${scores.loss_aversion.windows.length} windows.`,
      severity: toSeverity(scores.loss_aversion.avg_score),
      occurrences: scores.loss_aversion.windows.length,
      suggestion: 'Use predefined stop-losses and take-profits to remove emotional decisions from your exits.',
      score: Math.round(scores.loss_aversion.avg_score * 100),
    },
  ];
}

const AnalysisPage = () => {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState<BehaviorType[] | undefined>();
  const [scores, setScores] = useState<BiasScores | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const handleAnalyze = (source: 'uploaded' | 'account', result?: AgentAnalysisResult) => {
    if (result) {
      // Both uploaded and account trades use the same display when we have results
      setAnalysisData(toBehaviorCards(result.scores));
      setScores(result.scores);
      setThreadId(result.thread_id);
      setReport(result.report);
      setShowAnalysis(true);
    } else {
      // Fallback for when no analysis result is available
      toast.info(`Analyzing ${source === 'uploaded' ? 'uploaded' : 'account'} trades... (using example data)`);
      setAnalysisData(undefined);
      setScores(null);
      setThreadId(null);
      setReport(null);
      setShowAnalysis(true);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold mb-6">Behavior Analysis</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Upload */}
          <div className="lg:col-span-1">
            <LogUpload onAnalyze={handleAnalyze} />
          </div>

          {/* Right column: Results */}
          <div className="lg:col-span-2 space-y-5">
            {showAnalysis ? (
              <>
                {/* Score cards */}
                <BehaviorAnalysis analysisData={analysisData} />

                {/* Feature data tables */}
                {scores && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                  >
                    <FeatureDataPanel scores={scores} />
                  </motion.div>
                )}

                {/* Expert report */}
                {report && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-card p-5"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">Expert Analysis Report</h3>
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-foreground/90 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:pl-4 [&_li]:mb-1 [&_strong]:text-primary [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                      <ReactMarkdown>{report}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}

                {/* Chat */}
                {threadId && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <AgentChat threadId={threadId} />
                  </motion.div>
                )}
              </>
            ) : (
              <div className="glass-card p-8 flex items-center justify-center h-64">
                <p className="text-sm text-muted-foreground text-center">
                  Upload trade logs to receive an AI-powered behavioral analysis
                  with expert insights and follow-up chat.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AnalysisPage;
