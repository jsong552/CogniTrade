import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5001';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ProgressEvent = {
  type: 'progress' | 'agent_event';
  step?: string;
  message?: string;
  action?: string;
  rationale?: string;
  observation?: string;
};

interface AgentChatProps {
  threadId: string;
}

export function AgentChat({ threadId }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages or progress change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [progressEvents]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    setProgressEvents([]);

    try {
      const res = await fetch(`${API_BASE}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, message: text }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let agentText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'content') {
              agentText = event.text;
            } else if (event.type === 'error') {
              agentText = `Error: ${event.message}`;
            } else if (event.type === 'progress' || event.type === 'agent_event') {
              setProgressEvents((prev) => [
                ...prev,
                {
                  type: event.type,
                  step: event.step,
                  message: event.message,
                  action: event.action,
                  rationale: event.rationale,
                  observation: event.observation,
                },
              ]);
            }
          } catch {
            // ignore malformed lines
          }
        }
      }

      if (agentText) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: agentText },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Could not reach the backend. Is the server running?',
        },
      ]);
    } finally {
      setLoading(false);
      setProgressEvents([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="glass-card flex flex-col h-[420px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">CogniTrade Expert</span>
        <span className="text-xs text-muted-foreground ml-auto">
          Ask follow-up questions about your trading patterns
        </span>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Ask the expert anything about your trading behavior, specific
              trades, or how to improve.
            </p>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 mt-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bot className="h-4 w-4 text-primary" />
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">Analyzing...</span>
              </div>
              {progressEvents.length > 0 && (
                <div
                  ref={progressRef}
                  className="space-y-1 max-h-32 overflow-y-auto rounded-md bg-muted/50 px-2 py-1.5 text-xs"
                >
                  {progressEvents.map((event, i) => {
                    const isLatest = i === progressEvents.length - 1;
                    const label =
                      event.type === 'agent_event' ? event.action : event.message;
                    return (
                      <div key={i} className="flex items-start gap-2">
                        {isLatest ? (
                          <Loader2 className="h-3 w-3 animate-spin mt-0.5 flex-shrink-0 text-primary" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-500" />
                        )}
                        <div className="min-w-0">
                          <span className="text-foreground/80">{label}</span>
                          {event.type === 'agent_event' && event.rationale && (
                            <p className="text-muted-foreground mt-0.5 text-[10px] italic leading-tight">
                              {event.rationale}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your trading patterns..."
          className="min-h-[40px] max-h-[80px] resize-none text-sm"
          rows={1}
          disabled={loading}
        />
        <Button
          size="icon"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="flex-shrink-0 self-end"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
