import { useEffect, useRef, useState } from 'react';
import { useTradingStore } from '@/lib/tradingStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mic, AudioLines } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface TradePanelProps {
  ticker: {
    symbol: string;
    name: string;
    price: number;
  };
}

type OrderType = 'market' | 'limit' | 'stop-loss' | 'take-profit';
type TradeType = 'buy' | 'sell';

export function TradePanel({ ticker }: TradePanelProps) {
  const { balance, positions, placeMarketOrder, placeLimitOrder, updateOrderNote } = useTradingStore();

  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isThoughtModalOpen, setIsThoughtModalOpen] = useState(false);
  const [thoughts, setThoughts] = useState('');
  const [transcript, setTranscript] = useState('');
  const [transcribeStatus, setTranscribeStatus] = useState<'idle' | 'connecting' | 'recording' | 'processing' | 'error'>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [noteTargetId, setNoteTargetId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const zeroGainRef = useRef<GainNode | null>(null);

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
  const backendWsUrl = backendUrl.replace(/^http/, 'ws') + '/transcribe/stream';

  const qty = parseInt(quantity) || 0;
  const currentPrice = ticker.price || 0;

  // Calculate the execution price based on order type
  const getExecutionPrice = () => {
    switch (orderType) {
      case 'market':
        return currentPrice;
      case 'limit':
        return parseFloat(limitPrice) || currentPrice;
      case 'stop-loss':
        return parseFloat(stopLoss) || currentPrice * 0.95;
      case 'take-profit':
        return parseFloat(takeProfit) || currentPrice * 1.05;
      default:
        return currentPrice;
    }
  };

  const executionPrice = getExecutionPrice();
  const total = qty * executionPrice;

  const position = positions.find(p => p.ticker === ticker.symbol);
  const maxSellQty = position?.quantity || 0;

  // Validation
  const canTrade = () => {
    if (qty <= 0) return false;
    if (currentPrice <= 0) return false;

    if (tradeType === 'buy') {
      return total <= balance;
    } else {
      return qty <= maxSellQty;
    }
  };

  const handleTrade = () => {
    if (!canTrade()) return;

    const slPrice = stopLoss ? parseFloat(stopLoss) : undefined;
    const tpPrice = takeProfit ? parseFloat(takeProfit) : undefined;

    let success = false;

    if (orderType === 'market') {
      success = placeMarketOrder({
        ticker: ticker.symbol,
        type: tradeType,
        quantity: qty,
        price: currentPrice,
        stopLoss: slPrice,
        takeProfit: tpPrice,
      });

      if (success) {
        toast.success(
          `${tradeType === 'buy' ? 'Bought' : 'Sold'} ${qty} ${ticker.symbol} @ $${currentPrice.toFixed(2)}`,
          { description: 'Market order filled immediately' }
        );
      }
    } else {
      // Limit, stop-loss, or take-profit orders go to pending
      success = placeLimitOrder({
        ticker: ticker.symbol,
        type: tradeType,
        orderType: orderType,
        quantity: qty,
        targetPrice: executionPrice,
        stopLoss: slPrice,
        takeProfit: tpPrice,
      });

      if (success) {
        const orderTypeLabel = orderType === 'limit' ? 'Limit' : orderType === 'stop-loss' ? 'Stop Loss' : 'Take Profit';
        toast.success(
          `${orderTypeLabel} order placed for ${qty} ${ticker.symbol}`,
          { description: `Will ${tradeType} at $${executionPrice.toFixed(2)}` }
        );
      }
    }

    if (!success) {
      toast.error('Order failed', {
        description: tradeType === 'buy' ? 'Insufficient balance' : 'Insufficient shares'
      });
    } else {
      const state = useTradingStore.getState();
      const latestOrderId = orderType === 'market'
        ? state.trades[0]?.id
        : state.pendingOrders[0]?.id;
      setNoteTargetId(latestOrderId ?? null);
      // Reset form
      setQuantity('1');
      setLimitPrice('');
      setStopLoss('');
      setTakeProfit('');
      setTranscript('');
      setThoughts('');
      setTranscribeStatus('idle');
      setIsThoughtModalOpen(true);
    }
  };

  const handleSaveNote = () => {
    if (noteTargetId && (thoughts.trim() || transcript.trim())) {
      updateOrderNote(noteTargetId, thoughts.trim(), transcript.trim());
      toast.success('Note saved to trade log');
    }
    setIsThoughtModalOpen(false);
    setNoteTargetId(null);
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setTranscribeStatus('processing');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_of_stream' }));
    }
    cleanupMedia();
  };

  const cleanupMedia = () => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    sourceNodeRef.current?.disconnect();
    workletNodeRef.current?.disconnect();
    zeroGainRef.current?.disconnect();
    sourceNodeRef.current = null;
    workletNodeRef.current = null;
    zeroGainRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Microphone access not supported in this browser');
      return;
    }

    try {
      setTranscribeStatus('connecting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (!window.AudioWorkletNode) {
        toast.error('Streaming not supported', { description: 'AudioWorklet is not available in this browser.' });
        setTranscribeStatus('error');
        cleanupMedia();
        return;
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule(new URL('../worklets/pcm-processor.ts', import.meta.url));

      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor', {
        processorOptions: { targetSampleRate: 24000, chunkSize: 1920 },
      });
      workletNodeRef.current = workletNode;

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const zeroGain = audioContext.createGain();
      zeroGain.gain.value = 0;
      zeroGainRef.current = zeroGain;

      sourceNode.connect(workletNode);
      workletNode.connect(zeroGain);
      zeroGain.connect(audioContext.destination);

      const ws = new WebSocket(backendWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setTranscribeStatus('recording');
        setIsRecording(true);
        ws.send(
          JSON.stringify({
            type: 'setup',
            model_name: 'default',
            input_format: 'pcm',
          })
        );
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'text' && data.text) {
            setTranscript(prev => `${prev} ${data.text}`.trim());
          } else if (data.type === 'end_of_stream') {
            ws.close();
          } else if (data.type === 'error') {
            setTranscribeStatus('error');
            toast.error('Transcription error', { description: data.message || 'Gradium error' });
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        setTranscribeStatus('error');
        toast.error('Transcription connection failed');
        cleanupMedia();
      };

      ws.onclose = () => {
        setTranscribeStatus('idle');
      };

      workletNode.port.onmessage = event => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const audio = arrayBufferToBase64(event.data as ArrayBuffer);
        ws.send(JSON.stringify({ type: 'audio', audio }));
      };
    } catch (error) {
      setTranscribeStatus('error');
      toast.error('Microphone access failed');
      cleanupMedia();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      setTranscript('');
      startRecording();
    }
  };

  useEffect(() => {
    if (!isThoughtModalOpen && isRecording) {
      stopRecording();
    }
  }, [isThoughtModalOpen, isRecording]);

  useEffect(() => {
    return () => {
      stopRecording();
      wsRef.current?.close();
      cleanupMedia();
    };
  }, []);

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Trade {ticker.symbol}</h3>
        <span className="text-xs text-muted-foreground font-mono">
          Balance: ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Buy/Sell toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
        <button
          onClick={() => setTradeType('buy')}
          className={`py-1.5 rounded-md text-xs font-semibold transition-all ${tradeType === 'buy' ? 'bg-gain text-primary-foreground' : 'text-muted-foreground'
            }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTradeType('sell')}
          className={`py-1.5 rounded-md text-xs font-semibold transition-all ${tradeType === 'sell' ? 'bg-loss text-foreground' : 'text-muted-foreground'
            }`}
        >
          Sell
        </button>
      </div>

      {/* Order type */}
      <div className="grid grid-cols-2 gap-1">
        {(['market', 'limit', 'stop-loss', 'take-profit'] as OrderType[]).map(ot => (
          <button
            key={ot}
            onClick={() => setOrderType(ot)}
            className={`py-1.5 rounded-md text-xs font-medium transition-all ${orderType === ot
                ? 'bg-accent text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {ot === 'market' ? 'Market' : ot === 'limit' ? 'Limit' : ot === 'stop-loss' ? 'Stop Loss' : 'Take Profit'}
          </button>
        ))}
      </div>

      {/* Order explanation */}
      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
        {orderType === 'market' && 'Executes immediately at current market price.'}
        {orderType === 'limit' && (tradeType === 'buy'
          ? 'Order fills when price drops to or below your limit price.'
          : 'Order fills when price rises to or above your limit price.'
        )}
        {orderType === 'stop-loss' && 'Sells automatically when price drops to your stop level.'}
        {orderType === 'take-profit' && 'Sells automatically when price rises to your target level.'}
      </div>

      {/* Quantity */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Shares</Label>
        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          className="bg-muted border-border font-mono text-sm"
        />
      </div>

      {/* Limit price - for limit orders */}
      {orderType === 'limit' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Limit Price {tradeType === 'buy' ? '(buy at or below)' : '(sell at or above)'}
          </Label>
          <Input
            type="number"
            step="0.01"
            placeholder={currentPrice.toFixed(2)}
            value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
            className="bg-muted border-border font-mono text-sm"
          />
        </div>
      )}

      {/* Stop Loss - for stop-loss orders */}
      {orderType === 'stop-loss' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Stop Loss Price</Label>
          <Input
            type="number"
            step="0.01"
            placeholder={(currentPrice * 0.95).toFixed(2)}
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            className="bg-muted border-border font-mono text-sm"
          />
        </div>
      )}

      {/* Take Profit - for take-profit orders */}
      {orderType === 'take-profit' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Take Profit Price</Label>
          <Input
            type="number"
            step="0.01"
            placeholder={(currentPrice * 1.05).toFixed(2)}
            value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            className="bg-muted border-border font-mono text-sm"
          />
        </div>
      )}

      {/* Optional Stop Loss/Take Profit for market orders */}
      {orderType === 'market' && tradeType === 'buy' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Stop Loss (optional)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={(currentPrice * 0.95).toFixed(2)}
              value={stopLoss}
              onChange={e => setStopLoss(e.target.value)}
              className="bg-muted border-border font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Take Profit (optional)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={(currentPrice * 1.05).toFixed(2)}
              value={takeProfit}
              onChange={e => setTakeProfit(e.target.value)}
              className="bg-muted border-border font-mono text-sm"
            />
          </div>
        </>
      )}

      {/* Total */}
      <div className="flex justify-between text-sm py-2 border-t border-border">
        <span className="text-muted-foreground">Estimated Total</span>
        <span className="font-mono font-semibold">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>

      {tradeType === 'sell' && maxSellQty > 0 && (
        <div className="text-xs text-muted-foreground">
          Available to sell: {maxSellQty} shares
        </div>
      )}

      {/* Pending order notice */}
      {orderType !== 'market' && (
        <div className="text-xs text-amber-500 bg-amber-500/10 p-2 rounded">
          ⏳ This order will be placed as pending and will execute when price conditions are met.
        </div>
      )}

      <Button
        onClick={handleTrade}
        disabled={!canTrade()}
        className={`w-full font-semibold ${tradeType === 'buy'
            ? 'bg-gain hover:bg-gain/90 text-primary-foreground'
            : 'bg-loss hover:bg-loss/90 text-foreground'
          }`}
      >
        {orderType === 'market'
          ? `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${ticker.symbol}`
          : `Place ${orderType === 'limit' ? 'Limit' : orderType === 'stop-loss' ? 'Stop Loss' : 'Take Profit'} Order`
        }
      </Button>

      <Dialog
        open={isThoughtModalOpen}
        onOpenChange={(open) => {
          setIsThoughtModalOpen(open);
          if (!open) {
            setNoteTargetId(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Record your thought process</DialogTitle>
            <DialogDescription>
              Capture why you made this trade while it is still fresh. Record a voice note OR write a quick note.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-6">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AudioLines className="h-4 w-4 text-muted-foreground" />
                Voice note
              </div>
              <div className="mt-6 flex flex-col items-center gap-3">
                <Button
                  variant={isRecording ? 'default' : 'outline'}
                  size="lg"
                  onClick={toggleRecording}
                  aria-pressed={isRecording}
                  disabled={transcribeStatus === 'connecting'}
                  className="h-16 rounded-full gap-3 px-10 text-base font-semibold shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                >
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
                  </span>
                  <Mic className="h-5 w-5" />
                  {isRecording ? 'Recording...' : 'Record'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {isRecording ? 'Tap again to stop' : 'Tap to start recording'}
                </span>
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Powered by Gradium STT.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Live transcript</Label>
                <span className="text-[11px] text-muted-foreground">
                  {transcribeStatus === 'recording' && 'Listening...'}
                  {transcribeStatus === 'processing' && 'Transcribing...'}
                  {transcribeStatus === 'connecting' && 'Connecting...'}
                  {transcribeStatus === 'error' && 'Error'}
                  {transcribeStatus === 'idle' && 'Idle'}
                </span>
              </div>
              <div className="mt-2 min-h-[64px] text-sm text-foreground">
                {transcript || 'Your transcript will appear here.'}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick notes (optional)</Label>
              <Textarea
                value={thoughts}
                onChange={e => setThoughts(e.target.value)}
                placeholder="What signal did you see? What risk are you taking? What is your exit plan?"
                className="min-h-[120px] bg-muted/30"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsThoughtModalOpen(false);
                setNoteTargetId(null);
              }}
            >
              Skip for now
            </Button>
            <Button onClick={handleSaveNote}>
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
