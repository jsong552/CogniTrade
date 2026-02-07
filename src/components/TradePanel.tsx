import { useState } from 'react';
import { StockTicker } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface TradePanelProps {
  ticker: StockTicker;
  balance: number;
  positions: { ticker: string; quantity: number }[];
  onTrade: (trade: any) => boolean;
}

type OrderType = 'market' | 'limit' | 'stop-loss' | 'take-profit';
type TradeType = 'buy' | 'sell';

export function TradePanel({ ticker, balance, positions, onTrade }: TradePanelProps) {
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');

  const qty = parseInt(quantity) || 0;
  const price = orderType === 'limit' ? (parseFloat(limitPrice) || ticker.price) : ticker.price;
  const total = qty * price;

  const position = positions.find(p => p.ticker === ticker.symbol);
  const maxSellQty = position?.quantity || 0;

  const canTrade = qty > 0 && (tradeType === 'buy' ? total <= balance : qty <= maxSellQty);

  const handleTrade = () => {
    if (!canTrade) return;

    onTrade({
      ticker: ticker.symbol,
      type: tradeType,
      orderType,
      quantity: qty,
      price,
      total,
      limitPrice: orderType === 'limit' ? parseFloat(limitPrice) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
    });

    toast.success(`${tradeType === 'buy' ? 'Bought' : 'Sold'} ${qty} ${ticker.symbol} @ $${price.toFixed(2)}`);
    setQuantity('1');
    setLimitPrice('');
    setStopLoss('');
    setTakeProfit('');
  };

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
          className={`py-1.5 rounded-md text-xs font-semibold transition-all ${
            tradeType === 'buy' ? 'bg-gain text-primary-foreground' : 'text-muted-foreground'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTradeType('sell')}
          className={`py-1.5 rounded-md text-xs font-semibold transition-all ${
            tradeType === 'sell' ? 'bg-loss text-foreground' : 'text-muted-foreground'
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
            className={`py-1.5 rounded-md text-xs font-medium transition-all ${
              orderType === ot
                ? 'bg-accent text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {ot === 'market' ? 'Market' : ot === 'limit' ? 'Limit' : ot === 'stop-loss' ? 'Stop Loss' : 'Take Profit'}
          </button>
        ))}
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

      {/* Limit price */}
      {orderType === 'limit' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Limit Price</Label>
          <Input
            type="number"
            step="0.01"
            placeholder={ticker.price.toFixed(2)}
            value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
            className="bg-muted border-border font-mono text-sm"
          />
        </div>
      )}

      {/* Stop Loss */}
      {(orderType === 'stop-loss' || orderType === 'market') && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Stop Loss</Label>
          <Input
            type="number"
            step="0.01"
            placeholder={(ticker.price * 0.95).toFixed(2)}
            value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            className="bg-muted border-border font-mono text-sm"
          />
        </div>
      )}

      {/* Take Profit */}
      {(orderType === 'take-profit' || orderType === 'market') && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Take Profit</Label>
          <Input
            type="number"
            step="0.01"
            placeholder={(ticker.price * 1.05).toFixed(2)}
            value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            className="bg-muted border-border font-mono text-sm"
          />
        </div>
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

      <Button
        onClick={handleTrade}
        disabled={!canTrade}
        className={`w-full font-semibold ${
          tradeType === 'buy'
            ? 'bg-gain hover:bg-gain/90 text-primary-foreground'
            : 'bg-loss hover:bg-loss/90 text-foreground'
        }`}
      >
        {tradeType === 'buy' ? 'Buy' : 'Sell'} {ticker.symbol}
      </Button>
    </div>
  );
}
