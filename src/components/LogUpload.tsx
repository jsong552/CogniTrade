import { useState, useRef } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5001';

export interface BiasModelResult {
  windows: Record<string, unknown>[];
  avg_score: number;
  feature_columns: string[];
  feature_data: Record<string, unknown>[];
}

export interface BiasScores {
  overtrading: BiasModelResult;
  revenge: BiasModelResult;
  loss_aversion: BiasModelResult;
}

export interface AgentAnalysisResult {
  thread_id: string;
  report: string;
  scores: BiasScores;
}

interface LogUploadProps {
  onAnalyze: (source: 'uploaded' | 'account', result?: AgentAnalysisResult) => void;
}

export function LogUpload({ onAnalyze }: LogUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      toast.success(`Uploaded: ${file.name}`);
    }
  };

  const handleAnalyzeUploaded = async () => {
    if (!uploadedFile) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const res = await fetch(`${API_BASE}/agent/analyze`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Analysis failed');
        return;
      }

      toast.success('Analysis complete!');
      onAnalyze('uploaded', data as AgentAnalysisResult);
    } catch (err) {
      toast.error('Could not reach the backend. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Upload Trade Logs</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a CSV trade log to analyze for behavioral patterns.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="hidden"
        />

        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl p-8 hover:border-primary/50 hover:bg-accent/30 transition-all flex flex-col items-center gap-2"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Click to upload CSV</span>
        </button>

        <AnimatePresence>
          {uploadedFile && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm">{uploadedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(uploadedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button onClick={() => setUploadedFile(null)}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {uploadedFile && (
          <Button
            className="w-full mt-3 bg-primary text-primary-foreground"
            onClick={handleAnalyzeUploaded}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Uploaded Logs'
            )}
          </Button>
        )}
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-2">Analyze Account Trades</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Run behavior analysis on trades from your paper trading account.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onAnalyze('account')}
        >
          Analyze My Trades
        </Button>
      </div>
    </div>
  );
}
