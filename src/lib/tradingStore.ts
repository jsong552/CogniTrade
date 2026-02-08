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

// Demo trades that demonstrate Loss Aversion behavior pattern:
// - Selling winners too quickly (taking small 1-3% profits)
// - Holding losers too long (letting losses grow to 8-15%)
// This is for demo purposes to show the AI analysis capabilities
const generateDemoTrades = (): FilledTrade[] => {
  const now = new Date();
  const trades: FilledTrade[] = [];

  // Helper to create a date X days ago
  const daysAgo = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  // Loss Aversion Pattern Trades:
  // Pattern 1: Quick profit-taking on winners (selling after small gains)
  // Pattern 2: Holding losers too long (large losses before selling)

  // Trade 1-2: AAPL - Bought, sold quickly for tiny 1.5% profit
  trades.push({
    id: 'demo-001',
    ticker: 'AAPL',
    type: 'buy',
    orderType: 'market',
    quantity: 50,
    price: 178.50,
    total: 8925,
    timestamp: daysAgo(45),
    status: 'filled',
  });
  trades.push({
    id: 'demo-002',
    ticker: 'AAPL',
    type: 'sell',
    orderType: 'market',
    quantity: 50,
    price: 181.20, // +1.5% profit - sold too early
    total: 9060,
    timestamp: daysAgo(43),
    status: 'filled',
  });

  // Trade 3-4: NVDA - Held through 12% loss before selling
  trades.push({
    id: 'demo-003',
    ticker: 'NVDA',
    type: 'buy',
    orderType: 'market',
    quantity: 30,
    price: 485.00,
    total: 14550,
    timestamp: daysAgo(42),
    status: 'filled',
  });
  trades.push({
    id: 'demo-004',
    ticker: 'NVDA',
    type: 'sell',
    orderType: 'market',
    quantity: 30,
    price: 426.80, // -12% loss - held too long
    total: 12804,
    timestamp: daysAgo(35),
    status: 'filled',
  });

  // Trade 5-6: MSFT - Quick 2% profit exit
  trades.push({
    id: 'demo-005',
    ticker: 'MSFT',
    type: 'buy',
    orderType: 'market',
    quantity: 40,
    price: 372.00,
    total: 14880,
    timestamp: daysAgo(38),
    status: 'filled',
  });
  trades.push({
    id: 'demo-006',
    ticker: 'MSFT',
    type: 'sell',
    orderType: 'market',
    quantity: 40,
    price: 379.45, // +2% profit - sold too early
    total: 15178,
    timestamp: daysAgo(36),
    status: 'filled',
  });

  // Trade 7-8: TSLA - Massive 15% loss before selling
  trades.push({
    id: 'demo-007',
    ticker: 'TSLA',
    type: 'buy',
    orderType: 'market',
    quantity: 25,
    price: 265.00,
    total: 6625,
    timestamp: daysAgo(34),
    status: 'filled',
  });
  trades.push({
    id: 'demo-008',
    ticker: 'TSLA',
    type: 'sell',
    orderType: 'market',
    quantity: 25,
    price: 225.25, // -15% loss - held way too long
    total: 5631.25,
    timestamp: daysAgo(25),
    status: 'filled',
  });

  // Trade 9-10: GOOGL - Quick 1.8% profit
  trades.push({
    id: 'demo-009',
    ticker: 'GOOGL',
    type: 'buy',
    orderType: 'market',
    quantity: 60,
    price: 141.50,
    total: 8490,
    timestamp: daysAgo(30),
    status: 'filled',
  });
  trades.push({
    id: 'demo-010',
    ticker: 'GOOGL',
    type: 'sell',
    orderType: 'market',
    quantity: 60,
    price: 144.05, // +1.8% profit - exited early
    total: 8643,
    timestamp: daysAgo(28),
    status: 'filled',
  });

  // Trade 11-12: META - 10% loss before selling
  trades.push({
    id: 'demo-011',
    ticker: 'META',
    type: 'buy',
    orderType: 'market',
    quantity: 20,
    price: 505.00,
    total: 10100,
    timestamp: daysAgo(27),
    status: 'filled',
  });
  trades.push({
    id: 'demo-012',
    ticker: 'META',
    type: 'sell',
    orderType: 'market',
    quantity: 20,
    price: 454.50, // -10% loss - held too long
    total: 9090,
    timestamp: daysAgo(20),
    status: 'filled',
  });

  // Trade 13-14: AMZN - Quick 2.5% profit
  trades.push({
    id: 'demo-013',
    ticker: 'AMZN',
    type: 'buy',
    orderType: 'market',
    quantity: 45,
    price: 178.00,
    total: 8010,
    timestamp: daysAgo(22),
    status: 'filled',
  });
  trades.push({
    id: 'demo-014',
    ticker: 'AMZN',
    type: 'sell',
    orderType: 'market',
    quantity: 45,
    price: 182.45, // +2.5% profit - sold early
    total: 8210.25,
    timestamp: daysAgo(20),
    status: 'filled',
  });

  // Trade 15-16: SPY - 8% loss before selling
  trades.push({
    id: 'demo-015',
    ticker: 'SPY',
    type: 'buy',
    orderType: 'market',
    quantity: 35,
    price: 498.00,
    total: 17430,
    timestamp: daysAgo(18),
    status: 'filled',
  });
  trades.push({
    id: 'demo-016',
    ticker: 'SPY',
    type: 'sell',
    orderType: 'market',
    quantity: 35,
    price: 458.16, // -8% loss - held too long
    total: 16035.60,
    timestamp: daysAgo(12),
    status: 'filled',
  });

  // Trade 17-18: AAPL again - Quick 1.2% profit
  trades.push({
    id: 'demo-017',
    ticker: 'AAPL',
    type: 'buy',
    orderType: 'market',
    quantity: 55,
    price: 185.00,
    total: 10175,
    timestamp: daysAgo(14),
    status: 'filled',
  });
  trades.push({
    id: 'demo-018',
    ticker: 'AAPL',
    type: 'sell',
    orderType: 'market',
    quantity: 55,
    price: 187.22, // +1.2% profit - exited very early
    total: 10297.10,
    timestamp: daysAgo(13),
    status: 'filled',
  });

  // Trade 19-20: NVDA again - 11% loss
  trades.push({
    id: 'demo-019',
    ticker: 'NVDA',
    type: 'buy',
    orderType: 'market',
    quantity: 22,
    price: 520.00,
    total: 11440,
    timestamp: daysAgo(10),
    status: 'filled',
  });
  trades.push({
    id: 'demo-020',
    ticker: 'NVDA',
    type: 'sell',
    orderType: 'market',
    quantity: 22,
    price: 462.80, // -11% loss - held too long
    total: 10181.60,
    timestamp: daysAgo(5),
    status: 'filled',
  });

  // Trade 21-22: MSFT - 2.1% quick profit
  trades.push({
    id: 'demo-021',
    ticker: 'MSFT',
    type: 'buy',
    orderType: 'market',
    quantity: 30,
    price: 385.00,
    total: 11550,
    timestamp: daysAgo(8),
    status: 'filled',
  });
  trades.push({
    id: 'demo-022',
    ticker: 'MSFT',
    type: 'sell',
    orderType: 'market',
    quantity: 30,
    price: 393.09, // +2.1% profit - sold early
    total: 11792.70,
    timestamp: daysAgo(7),
    status: 'filled',
  });

  // Trade 23-24: GOOGL - 9% loss before selling
  trades.push({
    id: 'demo-023',
    ticker: 'GOOGL',
    type: 'buy',
    orderType: 'market',
    quantity: 50,
    price: 152.00,
    total: 7600,
    timestamp: daysAgo(6),
    status: 'filled',
  });
  trades.push({
    id: 'demo-024',
    ticker: 'GOOGL',
    type: 'sell',
    orderType: 'market',
    quantity: 50,
    price: 138.32, // -9% loss - held too long
    total: 6916,
    timestamp: daysAgo(2),
    status: 'filled',
  });

  // Trade 25-26: AMZN - Quick 1.7% profit
  trades.push({
    id: 'demo-025',
    ticker: 'AMZN',
    type: 'buy',
    orderType: 'market',
    quantity: 40,
    price: 185.50,
    total: 7420,
    timestamp: daysAgo(4),
    status: 'filled',
  });
  trades.push({
    id: 'demo-026',
    ticker: 'AMZN',
    type: 'sell',
    orderType: 'market',
    quantity: 40,
    price: 188.65, // +1.7% profit - exited early
    total: 7546,
    timestamp: daysAgo(3),
    status: 'filled',
  });

  // Sort by timestamp (oldest first, then reverse for newest first in UI)
  return trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Generate demo trades once
const DEMO_TRADES = generateDemoTrades();

export const useTradingStore = create<TradingState & TradingActions>()(
  persist(
    (set, get) => ({
      // Initial state with demo trades for Loss Aversion demonstration
      balance: INITIAL_BALANCE,
      trades: DEMO_TRADES,
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
          trades: DEMO_TRADES, // Restore demo trades for Loss Aversion demonstration
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
          trades: DEMO_TRADES, // Restore demo trades for Loss Aversion demonstration
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
      version: 1, // Bump version to trigger migration
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as TradingState;
        // For version 0 (or no version), add demo trades if none exist
        if (version === 0 || !state.trades || state.trades.length === 0) {
          return {
            ...state,
            trades: DEMO_TRADES,
          };
        }
        return state;
      },
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
