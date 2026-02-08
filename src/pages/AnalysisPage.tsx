import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { LogUpload } from '@/components/LogUpload';
import { BehaviorAnalysis } from '@/components/BehaviorAnalysis';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const AnalysisPage = () => {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const handleAnalyze = (source: 'uploaded' | 'account') => {
    toast.info(`Analyzing ${source === 'uploaded' ? 'uploaded' : 'account'} trades... (using example data)`);
    setShowAnalysis(true);
    setAnalysisOpen(true);
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold mb-6">Behavior Analysis</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LogUpload onAnalyze={handleAnalyze} />
          <div>
            <div className="glass-card p-8 flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground text-center">
                Upload logs or analyze your account trades to see behavioral insights.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-6xl w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Behavior Analysis Results</DialogTitle>
            <DialogDescription>
              Detailed likelihoods and summaries for each trading behavior.
            </DialogDescription>
          </DialogHeader>
          {showAnalysis ? (
            <BehaviorAnalysis />
          ) : (
            <div className="text-sm text-muted-foreground">No analysis data yet.</div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default AnalysisPage;
