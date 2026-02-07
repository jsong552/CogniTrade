import { useState, useCallback } from 'react';
import { Trade, Position, TICKERS, INITIAL_BALANCE, MOCK_TRADES, MOCK_POSITIONS } from './mockData';

const STORAGE_KEY = 'paper-trading-state';

interface TradingState {
  balance: number;
  trades: Trade[];
  positions: Position[];
}

function loadState(): TradingState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    balance: INITIAL_BALANCE - 17452.50, // after mock trades
    trades: MOCK_TRADES,
    positions: MOCK_POSITIONS,
  };
}

function saveState(state: TradingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useTradingStore() {
  const [state, setState] = useState<TradingState>(loadState);

  const updateState = useCallback((updater: (prev: TradingState) => TradingState) => {
    setState(prev => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, []);

  const placeTrade = useCallback((trade: Omit<Trade, 'id' | 'timestamp' | 'status'>) => {
    const newTrade: Trade = {
      ...trade,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      status: trade.orderType === 'market' ? 'filled' : 'pending',
    };

    updateState(prev => {
      let newBalance = prev.balance;
      let newPositions = [...prev.positions];

      if (newTrade.status === 'filled') {
        if (trade.type === 'buy') {
          newBalance -= trade.total;
          const existing = newPositions.find(p => p.ticker === trade.ticker);
          if (existing) {
            const totalQty = existing.quantity + trade.quantity;
            existing.avgPrice = (existing.avgPrice * existing.quantity + trade.price * trade.quantity) / totalQty;
            existing.quantity = totalQty;
            existing.totalValue = totalQty * existing.currentPrice;
            existing.pnl = (existing.currentPrice - existing.avgPrice) * totalQty;
            existing.pnlPercent = ((existing.currentPrice - existing.avgPrice) / existing.avgPrice) * 100;
          } else {
            const ticker = TICKERS.find(t => t.symbol === trade.ticker);
            const currentPrice = ticker?.price ?? trade.price;
            newPositions.push({
              ticker: trade.ticker,
              quantity: trade.quantity,
              avgPrice: trade.price,
              currentPrice,
              totalValue: trade.quantity * currentPrice,
              pnl: (currentPrice - trade.price) * trade.quantity,
              pnlPercent: ((currentPrice - trade.price) / trade.price) * 100,
            });
          }
        } else {
          newBalance += trade.total;
          const existing = newPositions.find(p => p.ticker === trade.ticker);
          if (existing) {
            existing.quantity -= trade.quantity;
            if (existing.quantity <= 0) {
              newPositions = newPositions.filter(p => p.ticker !== trade.ticker);
            } else {
              existing.totalValue = existing.quantity * existing.currentPrice;
              existing.pnl = (existing.currentPrice - existing.avgPrice) * existing.quantity;
            }
          }
        }
      }

      return {
        balance: newBalance,
        trades: [newTrade, ...prev.trades],
        positions: newPositions,
      };
    });

    return true;
  }, [updateState]);

  const resetAccount = useCallback(() => {
    const fresh: TradingState = {
      balance: INITIAL_BALANCE,
      trades: [],
      positions: [],
    };
    saveState(fresh);
    setState(fresh);
  }, []);

  const portfolioValue = state.positions.reduce((sum, p) => sum + p.totalValue, 0) + state.balance;
  const totalPnl = state.positions.reduce((sum, p) => sum + p.pnl, 0);

  return {
    balance: state.balance,
    trades: state.trades,
    positions: state.positions,
    portfolioValue,
    totalPnl,
    placeTrade,
    resetAccount,
  };
}
