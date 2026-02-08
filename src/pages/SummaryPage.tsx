import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Sparkles, Trophy, RefreshCcw, Brain, ShieldCheck, Compass, CheckCircle2, XCircle } from 'lucide-react';
import trainData from '../../backend/rational_training/train.json';

type TrainRecord = {
  text: string;
  label: string;
};

type QuizChoice = {
  key: string;
  label: string;
};

type QuizQuestion = {
  id: string;
  text: string;
  correctKey: string;
  choices: QuizChoice[];
};

const BEHAVIORS = [
  {
    name: 'FOMO',
    severity: 'High',
    description:
      'Chasing trades because everyone else is in, even when your setup is not there.',
    example:
      'A stock is already up big and you jump in anyway, worried you will miss the move.',
    counter:
      'If it is not your setup, skip it. There will be another trade.',
  },
  {
    name: 'Loss Aversion',
    severity: 'Medium',
    description:
      'Cutting winners too quickly or holding losers too long to avoid feeling wrong.',
    example:
      'You take a small profit fast but refuse to stop out a losing position.',
    counter:
      'Set the stop and target before entry and let the plan play out.',
  },
  {
    name: 'Revenge Trading',
    severity: 'High',
    description:
      'Trading emotionally after a loss to make the money back immediately.',
    example:
      'A loss makes you angry, so you size up on the next trade without a clear setup.',
    counter:
      'Pause after losses. Reduce size and reset your mindset before re-entering.',
  },
  {
    name: 'Overtrading',
    severity: 'Medium',
    description:
      'Taking too many low-quality trades out of boredom or impatience.',
    example:
      'You keep clicking in and out all morning even though none of the setups are clean.',
    counter:
      'Limit yourself to a few high-quality trades per day and stick to a checklist.',
  },
  {
    name: "Gambler's Fallacy",
    severity: 'Medium',
    description:
      'Believing a streak must end, so you increase size because a win is "due."',
    example:
      'After several losses in a row, you assume the next trade has to win and size up.',
    counter:
      'Every trade is independent. Keep position sizing consistent with your plan.',
  },
];

const LABEL_MAP: Record<string, string> = {
  Overtrading: 'Overtrading',
  Loss_Aversion: 'Loss Aversion',
  Revenge_Trading: 'Revenge Trading',
  FOMO: 'FOMO',
  Gamblers_Fallacy: "Gambler's Fallacy",
};

const LABEL_KEYS = Object.keys(LABEL_MAP);
const QUESTIONS_PER_QUIZ = 10;

const formatLabel = (key: string) => LABEL_MAP[key] ?? key.replace(/_/g, ' ');

const shuffle = <T,>(items: T[]) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const buildChoices = (correctKey: string): QuizChoice[] => {
  const otherKeys = LABEL_KEYS.filter((key) => key !== correctKey);
  const picked = shuffle(otherKeys).slice(0, 3);
  return shuffle([correctKey, ...picked]).map((key) => ({
    key,
    label: formatLabel(key),
  }));
};

const SummaryPage = () => {
  const [seed, setSeed] = useState(0);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);

  const questions = useMemo(() => {
    const records = (trainData as { data?: TrainRecord[] })?.data ?? [];
    if (records.length === 0) return [];

    const normalized = records.filter((record) => LABEL_KEYS.includes(record.label));
    const picked = shuffle(normalized).slice(0, QUESTIONS_PER_QUIZ);

    return picked.map((record, index) => ({
      id: `${seed}-${index}-${record.label}`,
      text: record.text,
      correctKey: record.label,
      choices: buildChoices(record.label),
    }));
  }, [seed]);

  const currentQuestion = questions[currentIndex];

  const handleStart = () => {
    if (questions.length === 0) return;
    setStarted(true);
  };

  const handleCheck = () => {
    if (!selectedKey || showAnswer || !currentQuestion) return;
    setShowAnswer(true);
    if (selectedKey === currentQuestion.correctKey) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    if (currentIndex >= questions.length - 1) {
      setCompleted(true);
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    setSelectedKey(null);
    setShowAnswer(false);
  };

  const handleRestart = () => {
    setSeed((prev) => prev + 1);
    setStarted(false);
    setCurrentIndex(0);
    setSelectedKey(null);
    setShowAnswer(false);
    setScore(0);
    setCompleted(false);
  };

  const handleEndQuiz = () => {
    setStarted(false);
    setCurrentIndex(0);
    setSelectedKey(null);
    setShowAnswer(false);
    setScore(0);
    setCompleted(false);
  };

  const progressPercent = questions.length > 0
    ? Math.round(((currentIndex + (showAnswer || completed ? 1 : 0)) / questions.length) * 100)
    : 0;

  const answerState = showAnswer && currentQuestion
    ? selectedKey === currentQuestion.correctKey
      ? 'correct'
      : 'incorrect'
    : null;

  return (
    <AppLayout>
      <div className="space-y-8">
        {!started ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold">Behavior Summary</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  A quick, practical guide to the five most common trading behaviors. Use these
                  examples as a checklist before you enter a trade.
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                Learn once, review often
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                {BEHAVIORS.map((behavior) => (
                  <div key={behavior.name} className="glass-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold">{behavior.name}</h2>
                      <span className="text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary">
                        {behavior.severity} impact
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{behavior.description}</p>
                    <div className="p-3 rounded-lg bg-muted/60 border border-border/50">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Example</div>
                      <p className="text-xs">{behavior.example}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">Try instead: </span>
                      {behavior.counter}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                <div className="glass-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">How to Use This</h3>
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li>Pick one behavior to focus on each week.</li>
                    <li>Write down a single rule that prevents it.</li>
                    <li>Review the rule before your first trade of the day.</li>
                    <li>Log any time you break it and why.</li>
                  </ul>
                </div>

                <div className="glass-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">Pre-Trade Checklist</h3>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      Is this a planned setup or a reaction?
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      Do I have a clear stop and target?
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      Am I increasing size because of a loss?
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      Would I take this trade again tomorrow?
                    </div>
                  </div>
                </div>

                <div className="glass-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">Daily Intention</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Trade less, plan more. Your edge comes from consistency, not volume.
                  </p>
                  <div className="text-xs font-medium text-foreground">
                    "I only take trades that match my setup and risk rules."
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="text-xs text-muted-foreground">Ready to test yourself?</div>
              <button
                onClick={handleStart}
                className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-primary text-primary-foreground text-base font-semibold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
              >
                Start Quiz
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Behavior Quiz</h2>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Test your awareness with real training examples. Each prompt comes from the
                  behavior dataset, and your job is to identify the pattern.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  10 questions per round
                </div>
                <button
                  onClick={handleEndQuiz}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                >
                  End Quiz
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {completed ? (
                  <div className="glass-card p-6 space-y-5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Trophy className="h-4 w-4" />
                      Quiz complete
                    </div>
                    <div className="text-3xl font-bold">
                      {score} / {questions.length}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Keep practicing to make these behaviors easy to spot in real time.
                    </p>
                    <button
                      onClick={handleRestart}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Try another set
                    </button>
                  </div>
                ) : (
                  <div className="glass-card p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Question {currentIndex + 1} of {questions.length}
                      </div>
                      <div className="text-xs text-muted-foreground">Score: {score}</div>
                    </div>

                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                      <p className="text-sm leading-relaxed">{currentQuestion?.text}</p>
                    </div>

                    {answerState && (
                      <div
                        className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${answerState === 'correct'
                          ? 'border-gain/60 bg-gain/10 text-gain'
                          : 'border-loss/60 bg-loss/10 text-loss'
                        }`}
                      >
                        {answerState === 'correct'
                          ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                          : <XCircle className="h-5 w-5 flex-shrink-0" />}
                        <div>
                          <div className="text-sm font-semibold">
                            {answerState === 'correct' ? 'Correct' : 'Not quite'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Correct answer: {formatLabel(currentQuestion.correctKey)}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentQuestion?.choices.map((choice) => {
                        const isSelected = selectedKey === choice.key;
                        const isCorrect = showAnswer && choice.key === currentQuestion.correctKey;
                        const isIncorrect = showAnswer && isSelected && choice.key !== currentQuestion.correctKey;

                        return (
                          <button
                            key={choice.key}
                            onClick={() => setSelectedKey(choice.key)}
                            disabled={showAnswer}
                            className={`text-left px-4 py-3 rounded-lg border transition-all ${isCorrect
                              ? 'border-gain bg-gain/10 text-gain'
                              : isIncorrect
                                ? 'border-loss bg-loss/10 text-loss'
                                : isSelected
                                  ? 'border-primary bg-primary/10 text-foreground'
                                  : 'border-border/60 bg-card/60 text-foreground hover:bg-accent/60'
                              }`}
                          >
                            <div className="text-sm font-medium">{choice.label}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleCheck}
                        disabled={!selectedKey || showAnswer}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                      >
                        Check Answer
                      </button>
                      <button
                        onClick={handleNext}
                        disabled={!showAnswer}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="glass-card p-5 space-y-3">
                  <h3 className="text-sm font-semibold">Behavior Key</h3>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div>
                      <span className="text-foreground font-medium">FOMO:</span> Chasing moves to avoid missing out.
                    </div>
                    <div>
                      <span className="text-foreground font-medium">Loss Aversion:</span> Cutting winners early or holding losers.
                    </div>
                    <div>
                      <span className="text-foreground font-medium">Revenge Trading:</span> Trading emotionally to win losses back.
                    </div>
                    <div>
                      <span className="text-foreground font-medium">Overtrading:</span> Taking too many low-quality trades.
                    </div>
                    <div>
                      <span className="text-foreground font-medium">Gambler's Fallacy:</span> Expecting streaks to flip because "they must".
                    </div>
                  </div>
                </div>

                <div className="glass-card p-5 space-y-3">
                  <h3 className="text-sm font-semibold">Tips</h3>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li>Read the prompt out loud before choosing.</li>
                    <li>Look for emotion-driven language or impatience.</li>
                    <li>Keep your own journal to spot patterns faster.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default SummaryPage;
