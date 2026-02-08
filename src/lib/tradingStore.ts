import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StockTicker } from './mockData';

// Default watchlist symbols
const DEFAULT_WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY'];

export interface WatchlistTicker extends StockTicker {
  addedAt: string;
}

export interface PendingOrder {
  id: string;
  ticker: string;
  type: 'buy' | 'sell';
  orderType: 'limit' | 'stop-loss' | 'take-profit';
  quantity: number;
  targetPrice: number; // The limit/stop/take-profit price
  total: number;
  createdAt: string;
  status: 'pending' | 'filled' | 'cancelled';
  stopLoss?: number;
  takeProfit?: number;
  note?: string;
  transcript?: string;
}

export interface FilledTrade {
  id: string;
  ticker: string;
  type: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop-loss' | 'take-profit';
  quantity: number;
  price: number;
  total: number;
  timestamp: string;
  status: 'filled' | 'pending' | 'cancelled';
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  filledFrom?: string; // ID of the pending order if it was filled from one
  note?: string;
  transcript?: string;
}

export interface Position {
  ticker: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  totalValue: number;
  pnl: number;
  pnlPercent: number;
}

interface TradingState {
  // Account state
  balance: number;
  trades: FilledTrade[];
  positions: Position[];
  pendingOrders: PendingOrder[];

  // Watchlist
  watchlist: string[];
  watchlistPrices: Record<string, { price: number; change: number; changePercent: number }>;

  // Real-time prices for order monitoring
  currentPrices: Record<string, number>;
}

interface TradingActions {
  // Watchlist management
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;
  updateWatchlistPrice: (symbol: string, price: number, change: number, changePercent: number) => void;

  // Trading actions
  placeMarketOrder: (order: {
    ticker: string;
    type: 'buy' | 'sell';
    quantity: number;
    price: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => boolean;

  placeLimitOrder: (order: {
    ticker: string;
    type: 'buy' | 'sell';
    orderType: 'limit' | 'stop-loss' | 'take-profit';
    quantity: number;
    targetPrice: number;
    stopLoss?: number;
    takeProfit?: number;
  }) => boolean;

  cancelPendingOrder: (orderId: string) => void;
  updateOrderNote: (orderId: string, note: string, transcript: string) => void;

  // Price monitoring - called every 5 seconds to check pending orders
  updatePrice: (symbol: string, price: number) => void;
  checkAndFillOrders: () => void;

  // Account management
  resetAccount: () => void;
  resetAccountWithBalance: (newBalance: number) => void;

  // Computed values
  getPortfolioValue: () => number;
  getTotalPnl: () => number;
}

const INITIAL_BALANCE = 100000;

export const useTradingStore = create<TradingState & TradingActions>()(
  persist(
    (set, get) => ({
      // Initial state
      balance: INITIAL_BALANCE,
      trades: [],
      positions: [],
      pendingOrders: [],
      watchlist: DEFAULT_WATCHLIST,
      watchlistPrices: {},
      currentPrices: {},

      // Watchlist management
      addToWatchlist: (symbol: string) => {
        const upperSymbol = symbol.toUpperCase();
        set((state) => {
          if (state.watchlist.includes(upperSymbol)) return state;
          return { watchlist: [...state.watchlist, upperSymbol] };
        });
      },

      removeFromWatchlist: (symbol: string) => {
        const upperSymbol = symbol.toUpperCase();
        set((state) => ({
          watchlist: state.watchlist.filter(s => s !== upperSymbol),
        }));
      },

      isInWatchlist: (symbol: string) => {
        return get().watchlist.includes(symbol.toUpperCase());
      },

      updateWatchlistPrice: (symbol: string, price: number, change: number, changePercent: number) => {
        set((state) => ({
          watchlistPrices: {
            ...state.watchlistPrices,
            [symbol.toUpperCase()]: { price, change, changePercent },
          },
          currentPrices: {
            ...state.currentPrices,
            [symbol.toUpperCase()]: price,
          },
        }));
      },

      // Place a market order (executes immediately)
      placeMarketOrder: (order) => {
        const state = get();
        const total = order.quantity * order.price;

        // Validation
        if (order.type === 'buy' && total > state.balance) {
          return false;
        }

        if (order.type === 'sell') {
          const position = state.positions.find(p => p.ticker === order.ticker);
          if (!position || position.quantity < order.quantity) {
            return false;
          }
        }

        const trade: FilledTrade = {
          id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ticker: order.ticker,
          type: order.type,
          orderType: 'market',
          quantity: order.quantity,
          price: order.price,
          total,
          timestamp: new Date().toISOString(),
          status: 'filled',
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
        };

        set((state) => {
          let newBalance = state.balance;
          let newPositions = [...state.positions];

          if (order.type === 'buy') {
            newBalance -= total;
            const existing = newPositions.find(p => p.ticker === order.ticker);
            if (existing) {
              const totalQty = existing.quantity + order.quantity;
              existing.avgPrice = (existing.avgPrice * existing.quantity + order.price * order.quantity) / totalQty;
              existing.quantity = totalQty;
              existing.currentPrice = order.price;
              existing.totalValue = totalQty * order.price;
              existing.pnl = (order.price - existing.avgPrice) * totalQty;
              existing.pnlPercent = ((order.price - existing.avgPrice) / existing.avgPrice) * 100;
            } else {
              newPositions.push({
                ticker: order.ticker,
                quantity: order.quantity,
                avgPrice: order.price,
                currentPrice: order.price,
                totalValue: order.quantity * order.price,
                pnl: 0,
                pnlPercent: 0,
              });
            }
          } else {
            newBalance += total;
            const existing = newPositions.find(p => p.ticker === order.ticker);
            if (existing) {
              existing.quantity -= order.quantity;
              if (existing.quantity <= 0) {
                newPositions = newPositions.filter(p => p.ticker !== order.ticker);
              } else {
                existing.totalValue = existing.quantity * existing.currentPrice;
                existing.pnl = (existing.currentPrice - existing.avgPrice) * existing.quantity;
              }
            }
          }

          // If this order has stop-loss or take-profit, create pending orders for them
          const newPendingOrders = [...state.pendingOrders];

          if (order.type === 'buy' && order.stopLoss) {
            newPendingOrders.push({
              id: `pending-sl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ticker: order.ticker,
              type: 'sell',
              orderType: 'stop-loss',
              quantity: order.quantity,
              targetPrice: order.stopLoss,
              total: order.quantity * order.stopLoss,
              createdAt: new Date().toISOString(),
              status: 'pending',
            });
          }

          if (order.type === 'buy' && order.takeProfit) {
            newPendingOrders.push({
              id: `pending-tp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ticker: order.ticker,
              type: 'sell',
              orderType: 'take-profit',
              quantity: order.quantity,
              targetPrice: order.takeProfit,
              total: order.quantity * order.takeProfit,
              createdAt: new Date().toISOString(),
              status: 'pending',
            });
          }

          return {
            balance: newBalance,
            trades: [trade, ...state.trades],
            positions: newPositions,
            pendingOrders: newPendingOrders,
          };
        });

        return true;
      },

      // Place a limit/stop/take-profit order (goes to pending)
      placeLimitOrder: (order) => {
        const state = get();
        const total = order.quantity * order.targetPrice;

        // Validation for buy orders - need enough balance
        if (order.type === 'buy' && total > state.balance) {
          return false;
        }

        // Validation for sell orders - need enough shares
        if (order.type === 'sell') {
          const position = state.positions.find(p => p.ticker === order.ticker);
          if (!position || position.quantity < order.quantity) {
            return false;
          }
        }

        const pendingOrder: PendingOrder = {
          id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ticker: order.ticker,
          type: order.type,
          orderType: order.orderType,
          quantity: order.quantity,
          targetPrice: order.targetPrice,
          total,
          createdAt: new Date().toISOString(),
          status: 'pending',
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
        };

        // For buy limit orders, reserve the balance
        set((state) => ({
          pendingOrders: [pendingOrder, ...state.pendingOrders],
          balance: order.type === 'buy' ? state.balance - total : state.balance,
        }));

        return true;
      },

      cancelPendingOrder: (orderId: string) => {
        set((state) => {
          const order = state.pendingOrders.find(o => o.id === orderId);
          if (!order) return state;

          // Refund balance for cancelled buy orders
          const refund = order.type === 'buy' ? order.total : 0;

          return {
            pendingOrders: state.pendingOrders.map(o =>
              o.id === orderId ? { ...o, status: 'cancelled' as const } : o
            ),
            balance: state.balance + refund,
          };
        });
      },

      updateOrderNote: (orderId: string, note: string, transcript: string) => {
        set((state) => ({
          trades: state.trades.map(trade =>
            trade.id === orderId ? { ...trade, note, transcript } : trade
          ),
          pendingOrders: state.pendingOrders.map(order =>
            order.id === orderId ? { ...order, note, transcript } : order
          ),
        }));
      },

      updatePrice: (symbol: string, price: number) => {
        const upperSymbol = symbol.toUpperCase();
        set((state) => {
          const positions = state.positions.map((position) => {
            if (position.ticker !== upperSymbol) return position;

            const totalValue = position.quantity * price;
            const pnl = (price - position.avgPrice) * position.quantity;
            const pnlPercent = position.avgPrice > 0 ? ((price - position.avgPrice) / position.avgPrice) * 100 : 0;

            return {
              ...position,
              currentPrice: price,
              totalValue,
              pnl,
              pnlPercent,
            };
          });

          return {
            currentPrices: {
              ...state.currentPrices,
              [upperSymbol]: price,
            },
            positions,
          };
        });
      },

      // Check pending orders and fill them if conditions are met
      checkAndFillOrders: () => {
        const state = get();
        const filledOrderIds: string[] = [];
        const newTrades: FilledTrade[] = [];
        let balanceChange = 0;
        let positionsToUpdate: Position[] = [...state.positions];

        for (const order of state.pendingOrders) {
          if (order.status !== 'pending') continue;

          const currentPrice = state.currentPrices[order.ticker];
          if (!currentPrice) continue;

          let shouldFill = false;
          let fillPrice = currentPrice;

          switch (order.orderType) {
            case 'limit':
              // Buy limit: fill when price drops to or below target
              // Sell limit: fill when price rises to or above target
              if (order.type === 'buy' && currentPrice <= order.targetPrice) {
                shouldFill = true;
                fillPrice = order.targetPrice; // Fill at limit price
              } else if (order.type === 'sell' && currentPrice >= order.targetPrice) {
                shouldFill = true;
                fillPrice = order.targetPrice;
              }
              break;

            case 'stop-loss':
              // Stop-loss sell: fill when price drops to or below stop price
              if (order.type === 'sell' && currentPrice <= order.targetPrice) {
                shouldFill = true;
                fillPrice = currentPrice; // Fill at market price when triggered
              }
              break;

            case 'take-profit':
              // Take-profit sell: fill when price rises to or above target
              if (order.type === 'sell' && currentPrice >= order.targetPrice) {
                shouldFill = true;
                fillPrice = currentPrice;
              }
              break;
          }

          if (shouldFill) {
            // Check if we still have enough shares to sell
            if (order.type === 'sell') {
              const position = positionsToUpdate.find(p => p.ticker === order.ticker);
              if (!position || position.quantity < order.quantity) {
                continue; // Skip this order, not enough shares
              }
            }

            const total = order.quantity * fillPrice;
            filledOrderIds.push(order.id);

            const trade: FilledTrade = {
              id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ticker: order.ticker,
              type: order.type,
              orderType: order.orderType,
              quantity: order.quantity,
              price: fillPrice,
              total,
              timestamp: new Date().toISOString(),
              status: 'filled',
              limitPrice: order.orderType === 'limit' ? order.targetPrice : undefined,
              stopLoss: order.stopLoss,
              takeProfit: order.takeProfit,
              filledFrom: order.id,
              note: order.note,
              transcript: order.transcript,
            };
            newTrades.push(trade);

            // Update positions
            if (order.type === 'buy') {
              const existing = positionsToUpdate.find(p => p.ticker === order.ticker);
              if (existing) {
                const totalQty = existing.quantity + order.quantity;
                existing.avgPrice = (existing.avgPrice * existing.quantity + fillPrice * order.quantity) / totalQty;
                existing.quantity = totalQty;
                existing.currentPrice = fillPrice;
                existing.totalValue = totalQty * fillPrice;
                existing.pnl = (fillPrice - existing.avgPrice) * totalQty;
                existing.pnlPercent = ((fillPrice - existing.avgPrice) / existing.avgPrice) * 100;
              } else {
                positionsToUpdate.push({
                  ticker: order.ticker,
                  quantity: order.quantity,
                  avgPrice: fillPrice,
                  currentPrice: fillPrice,
                  totalValue: order.quantity * fillPrice,
                  pnl: 0,
                  pnlPercent: 0,
                });
              }
            } else {
              balanceChange += total;
              const existing = positionsToUpdate.find(p => p.ticker === order.ticker);
              if (existing) {
                existing.quantity -= order.quantity;
                if (existing.quantity <= 0) {
                  positionsToUpdate = positionsToUpdate.filter(p => p.ticker !== order.ticker);
                } else {
                  existing.totalValue = existing.quantity * existing.currentPrice;
                  existing.pnl = (existing.currentPrice - existing.avgPrice) * existing.quantity;
                }
              }
            }
          }
        }

        if (filledOrderIds.length > 0) {
          set((state) => ({
            pendingOrders: state.pendingOrders.map(o =>
              filledOrderIds.includes(o.id) ? { ...o, status: 'filled' as const } : o
            ),
            trades: [...newTrades, ...state.trades],
            positions: positionsToUpdate,
            balance: state.balance + balanceChange,
          }));
        }
      },

      resetAccount: () => {
        const state = get();
        set({
          balance: INITIAL_BALANCE,
          trades: [],
          positions: [],
          pendingOrders: [],
          watchlist: state.watchlist, // Preserve watchlist
          watchlistPrices: state.watchlistPrices, // Preserve prices
          currentPrices: state.currentPrices, // Preserve prices
        });
      },

      resetAccountWithBalance: (newBalance: number) => {
        const state = get();
        set({
          balance: newBalance,
          trades: [],
          positions: [],
          pendingOrders: [],
          watchlist: state.watchlist, // Preserve watchlist
          watchlistPrices: state.watchlistPrices, // Preserve prices
          currentPrices: state.currentPrices, // Preserve prices
        });
      },

      getPortfolioValue: () => {
        const state = get();
        return state.positions.reduce((sum, p) => sum + p.totalValue, 0) + state.balance;
      },

      getTotalPnl: () => {
        const state = get();
        return state.positions.reduce((sum, p) => sum + p.pnl, 0);
      },
    }),
    {
      name: 'cognitrade-trading-store',
    }
  )
);

// Hook to get combined trades + pending orders for logs
export function useAllOrders() {
  const { trades, pendingOrders } = useTradingStore();

  // Combine and sort by date
  const allOrders = [
    ...trades.map(t => ({ ...t, isPending: false })),
    ...pendingOrders
      .filter(o => o.status === 'pending')
      .map(o => ({
        id: o.id,
        ticker: o.ticker,
        type: o.type,
        orderType: o.orderType,
        quantity: o.quantity,
        price: o.targetPrice,
        total: o.total,
        timestamp: o.createdAt,
        status: o.status,
        isPending: true,
        stopLoss: o.stopLoss,
        takeProfit: o.takeProfit,
        note: o.note,
        transcript: o.transcript,
      })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return allOrders;
}
