import { useState } from 'react';
import { useTradingStore } from '@/lib/tradingStore';
import { Button } from '@/components/ui/button';
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
  const { balance, positions, placeMarketOrder, placeLimitOrder } = useTradingStore();

  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');

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
      // Reset form
      setQuantity('1');
      setLimitPrice('');
      setStopLoss('');
      setTakeProfit('');
    }
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
    </div>
  );
}
