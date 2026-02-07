import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { LogUpload } from '@/components/LogUpload';
import { BehaviorAnalysis } from '@/components/BehaviorAnalysis';
import { toast } from 'sonner';

const AnalysisPage = () => {
  const [showAnalysis, setShowAnalysis] = useState(false);

  const handleAnalyze = (source: 'uploaded' | 'account') => {
    toast.info(`Analyzing ${source === 'uploaded' ? 'uploaded' : 'account'} trades... (using example data)`);
    setShowAnalysis(true);
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold mb-6">Behavior Analysis</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LogUpload onAnalyze={handleAnalyze} />
          <div>
            {showAnalysis ? (
              <BehaviorAnalysis />
            ) : (
              <div className="glass-card p-8 flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground text-center">
                  Upload logs or analyze your account trades to see behavioral insights.
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
