"""
Fake User Transaction Data Generator

Generates realistic trading transaction data with behavioral patterns:
- Overtrading: Excessive number of trades in short periods
- Loss Aversion: Holding losers too long, selling winners too early
- Revenge Trading: Increasing trade frequency/size after losses
- FOMO: Buying after price increases, chasing momentum

"""

import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta
from pathlib import Path
import os

# Configuration
STOCKS_FOLDER = Path(__file__).parent / "stocks"
OUTPUT_BASE = Path(__file__).parent / "fake_transactions"  # Base name without extension


def get_next_output_file():
    """Get the next available output filename with auto-incrementing number."""
    base_dir = OUTPUT_BASE.parent
    base_name = OUTPUT_BASE.name
    
    # Find all existing files matching the pattern
    existing_files = list(base_dir.glob(f"{base_name}*.csv"))
    
    if not existing_files:
        return base_dir / f"{base_name}_1.csv"
    
    # Extract numbers from existing filenames
    max_num = 0
    for f in existing_files:
        name = f.stem  # filename without extension
        # Try to extract the number suffix
        if name == base_name:
            # Old format without number, treat as 0
            max_num = max(max_num, 0)
        elif name.startswith(f"{base_name}_"):
            try:
                num = int(name.replace(f"{base_name}_", ""))
                max_num = max(max_num, num)
            except ValueError:
                pass
    
    return base_dir / f"{base_name}_{max_num + 1}.csv"
NUM_TRANSACTIONS = 100  # Target number of transactions
INITIAL_CASH = 100000  # Starting cash
SEED = 4  # For reproducibility

# Set random seeds
random.seed(SEED)
np.random.seed(SEED)


def load_stock_data():
    """Load all stock CSV files and combine into a single DataFrame."""
    all_data = {}
    
    for file in STOCKS_FOLDER.glob("Stocks data - *.csv"):
        ticker = file.stem.replace("Stocks data - ", "")
        df = pd.read_csv(file)
        df['Date'] = pd.to_datetime(df['Date']).dt.date
        df = df.sort_values('Date')
        all_data[ticker] = df.set_index('Date').to_dict('index')
    
    return all_data


def get_price_for_day(stock_data, ticker, date):
    """Get a realistic price between Open and Low for the given day."""
    if date not in stock_data[ticker]:
        return None, None, None
    
    day_data = stock_data[ticker][date]
    open_price = day_data['Open']
    low_price = day_data['Low']
    high_price = day_data['High']
    close_price = day_data['Close']
    
    # Price should be between open and low (more realistic for buys/sells)
    min_price = min(open_price, low_price)
    max_price = max(open_price, low_price)
    price = round(random.uniform(min_price, max_price), 2)
    
    return price, close_price, day_data


def get_previous_close(stock_data, ticker, date, days_back=1):
    """Get the close price from previous trading day(s)."""
    dates = sorted(stock_data[ticker].keys())
    try:
        idx = dates.index(date)
        if idx >= days_back:
            prev_date = dates[idx - days_back]
            return stock_data[ticker][prev_date]['Close']
    except (ValueError, IndexError):
        pass
    return None


def calculate_momentum(stock_data, ticker, date, lookback=5):
    """Calculate price momentum (% change over lookback period)."""
    dates = sorted(stock_data[ticker].keys())
    try:
        idx = dates.index(date)
        if idx >= lookback:
            old_price = stock_data[ticker][dates[idx - lookback]]['Close']
            current_price = stock_data[ticker][date]['Close']
            return (current_price - old_price) / old_price
    except (ValueError, IndexError):
        pass
    return 0


def generate_random_timestamp(date):
    """Generate a random timestamp during market hours (9:30 AM - 4:00 PM)."""
    hour = random.randint(9, 15)
    if hour == 9:
        minute = random.randint(30, 59)
    elif hour == 15:
        minute = random.randint(0, 59)
    else:
        minute = random.randint(0, 59)
    second = random.randint(0, 59)
    
    return datetime(date.year, date.month, date.day, hour, minute, second)


class TradingSimulator:
    """Simulates a trader with behavioral biases."""
    
    def __init__(self, stock_data, initial_cash=100000):
        self.stock_data = stock_data
        self.cash = initial_cash
        self.portfolio = {}  # ticker -> {'shares': int, 'avg_cost': float}
        self.transactions = []
        self.recent_losses = []  # Track recent losses for revenge trading
        self.tickers = list(stock_data.keys())
        
        # Behavioral state
        self.loss_streak = 0
        self.fomo_active = False
        self.overtrading_mode = False
        self.revenge_trading_mode = False
        
    def get_holdings(self, ticker):
        """Get current holdings for a ticker."""
        if ticker in self.portfolio:
            return self.portfolio[ticker]['shares']
        return 0
    
    def get_avg_cost(self, ticker):
        """Get average cost basis for a ticker."""
        if ticker in self.portfolio:
            return self.portfolio[ticker]['avg_cost']
        return 0
    
    def execute_buy(self, ticker, shares, price, timestamp):
        """Execute a buy order."""
        cost = shares * price
        if cost > self.cash:
            # Reduce shares to what we can afford
            shares = int(self.cash / price)
            if shares <= 0:
                return False
            cost = shares * price
        
        self.cash -= cost
        
        if ticker not in self.portfolio:
            self.portfolio[ticker] = {'shares': 0, 'avg_cost': 0}
        
        # Update average cost
        old_shares = self.portfolio[ticker]['shares']
        old_cost = self.portfolio[ticker]['avg_cost']
        new_shares = old_shares + shares
        if new_shares > 0:
            new_avg_cost = (old_shares * old_cost + shares * price) / new_shares
        else:
            new_avg_cost = price
        
        self.portfolio[ticker]['shares'] = new_shares
        self.portfolio[ticker]['avg_cost'] = new_avg_cost
        
        self.transactions.append({
            'Timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'Buy/Sell': 'Buy',
            'Asset/Ticker': ticker,
            'Amount': shares,
            'Price': round(price, 2)
        })
        return True
    
    def execute_sell(self, ticker, shares, price, timestamp):
        """Execute a sell order."""
        holdings = self.get_holdings(ticker)
        if holdings <= 0:
            return False
        
        # Can't sell more than we have
        shares = min(shares, holdings)
        
        avg_cost = self.get_avg_cost(ticker)
        profit = (price - avg_cost) * shares
        
        self.cash += shares * price
        self.portfolio[ticker]['shares'] -= shares
        
        if self.portfolio[ticker]['shares'] == 0:
            del self.portfolio[ticker]
        
        # Track profit/loss for behavioral patterns
        if profit < 0:
            self.recent_losses.append(abs(profit))
            self.loss_streak += 1
        else:
            self.loss_streak = max(0, self.loss_streak - 1)
        
        self.transactions.append({
            'Timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'Buy/Sell': 'Sell',
            'Asset/Ticker': ticker,
            'Amount': shares,
            'Price': round(price, 2)
        })
        return True
    
    def simulate_day(self, date, trade_probability=1.0, max_trades_per_day=None):
        """Simulate trading for a single day with behavioral patterns.
        
        Args:
            date: The trading date
            trade_probability: Probability of trading on this day (0-1)
            max_trades_per_day: Cap on trades per day (None for no cap)
        """
        # Check which tickers have data for this day
        available_tickers = [t for t in self.tickers if date in self.stock_data[t]]
        if not available_tickers:
            return
        
        # Skip some days based on trade_probability (for spreading out trades)
        if random.random() > trade_probability:
            return
        
        # Determine behavioral state for the day
        self._update_behavioral_state(date)
        
        # Determine number of trades for the day
        base_trades = random.randint(0, 3)
        
        if self.overtrading_mode:
            base_trades += random.randint(3, 8)  # More trades when overtrading
        
        if self.revenge_trading_mode:
            base_trades += random.randint(2, 5)  # More trades when revenge trading
        
        # Apply max trades cap if specified
        if max_trades_per_day is not None:
            base_trades = min(base_trades, max_trades_per_day)
        
        # Execute trades
        for _ in range(base_trades):
            self._execute_trade(date, available_tickers)
    
    def _update_behavioral_state(self, date):
        """Update behavioral modes based on recent activity."""
        # Revenge trading: triggered by consecutive losses
        if self.loss_streak >= 2:
            self.revenge_trading_mode = random.random() < 0.7
        else:
            self.revenge_trading_mode = random.random() < 0.1
        
        # Overtrading: random periods of excessive trading
        if random.random() < 0.15:  # 15% chance to enter/exit overtrading
            self.overtrading_mode = not self.overtrading_mode
        
        # Clean up old losses
        self.recent_losses = self.recent_losses[-10:]  # Keep last 10
    
    def _execute_trade(self, date, available_tickers):
        """Execute a single trade with behavioral biases."""
        
        # Calculate momentum for all available tickers
        momentum_scores = {}
        for ticker in available_tickers:
            momentum_scores[ticker] = calculate_momentum(self.stock_data, ticker, date)
        
        # FOMO behavior: prefer stocks with high recent momentum
        if random.random() < 0.4:  # 40% chance of FOMO behavior
            # Sort by momentum and pick from top performers
            sorted_tickers = sorted(momentum_scores.items(), key=lambda x: x[1], reverse=True)
            top_tickers = [t[0] for t in sorted_tickers[:3]]
            ticker = random.choice(top_tickers) if top_tickers else random.choice(available_tickers)
            fomo_trade = True
        else:
            ticker = random.choice(available_tickers)
            fomo_trade = False
        
        price, close_price, day_data = get_price_for_day(self.stock_data, ticker, date)
        if price is None:
            return
        
        timestamp = generate_random_timestamp(date)
        holdings = self.get_holdings(ticker)
        avg_cost = self.get_avg_cost(ticker)
        
        # Determine buy vs sell
        if holdings == 0:
            action = 'buy'
        else:
            # Loss aversion: reluctant to sell at a loss
            current_pnl = (price - avg_cost) / avg_cost if avg_cost > 0 else 0
            
            if current_pnl > 0.02:  # If profitable, more likely to sell (too early)
                sell_prob = 0.6
            elif current_pnl < -0.05:  # If losing, very reluctant to sell
                sell_prob = 0.15  # Hold losers too long
            else:
                sell_prob = 0.35
            
            # FOMO: if stock is going up and we own it, hold on hoping for more
            if fomo_trade and momentum_scores[ticker] > 0.03:
                sell_prob *= 0.5  # Less likely to sell during FOMO
            
            # Revenge trading: more aggressive after losses
            if self.revenge_trading_mode:
                if random.random() < 0.6:
                    action = 'buy'  # Double down during revenge trading
                else:
                    action = 'sell' if random.random() < sell_prob else 'buy'
            else:
                action = 'sell' if random.random() < sell_prob else 'buy'
        
        # Determine trade size
        if action == 'buy':
            self._execute_buy_with_behavior(ticker, price, timestamp, fomo_trade)
        else:
            self._execute_sell_with_behavior(ticker, price, timestamp)
    
    def _execute_buy_with_behavior(self, ticker, price, timestamp, fomo_trade):
        """Execute a buy with behavioral adjustments to size."""
        max_shares = int(self.cash * 0.25 / price)  # Max 25% of cash per trade
        
        if max_shares <= 0:
            return
        
        # Base amount
        base_shares = random.randint(1, max(1, max_shares // 2))
        
        # FOMO: buy larger amounts when chasing
        if fomo_trade:
            base_shares = int(base_shares * random.uniform(1.3, 2.0))
        
        # Revenge trading: larger positions to "make back" losses
        if self.revenge_trading_mode:
            base_shares = int(base_shares * random.uniform(1.5, 2.5))
        
        # Overtrading: sometimes smaller rapid trades
        if self.overtrading_mode and random.random() < 0.5:
            base_shares = max(1, base_shares // 2)
        
        shares = min(base_shares, max_shares)
        shares = max(1, shares)
        
        self.execute_buy(ticker, shares, price, timestamp)
    
    def _execute_sell_with_behavior(self, ticker, price, timestamp):
        """Execute a sell with behavioral adjustments."""
        holdings = self.get_holdings(ticker)
        if holdings <= 0:
            return
        
        avg_cost = self.get_avg_cost(ticker)
        current_pnl = (price - avg_cost) / avg_cost if avg_cost > 0 else 0
        
        # Loss aversion: sell smaller amounts when losing
        if current_pnl < 0:
            max_sell_pct = 0.3  # Only sell up to 30% of position
        else:
            max_sell_pct = 0.8  # Willing to sell more when winning
        
        # Overtrading: quick in-and-out
        if self.overtrading_mode:
            max_sell_pct = min(1.0, max_sell_pct + 0.3)
        
        max_shares = int(holdings * max_sell_pct)
        if max_shares <= 0:
            max_shares = 1
        
        shares = random.randint(1, max_shares)
        self.execute_sell(ticker, shares, price, timestamp)
    
    def get_transactions_df(self):
        """Return transactions as a DataFrame."""
        return pd.DataFrame(self.transactions)


def main():
    print("Loading stock data...")
    stock_data = load_stock_data()
    
    print(f"Loaded data for {len(stock_data)} stocks: {list(stock_data.keys())}")
    
    # Get all trading dates
    all_dates = set()
    for ticker_data in stock_data.values():
        all_dates.update(ticker_data.keys())
    
    trading_dates = sorted(all_dates)
    print(f"Trading period: {trading_dates[0]} to {trading_dates[-1]}")
    print(f"Total trading days: {len(trading_dates)}")
    
    # Initialize simulator
    print("\nSimulating trading with behavioral patterns...")
    print(f"Target transactions: {NUM_TRANSACTIONS}")
    simulator = TradingSimulator(stock_data, initial_cash=INITIAL_CASH)
    
    # Calculate trade density based on target transactions
    # Average ~4 trades per active day without caps, so estimate active days needed
    estimated_avg_trades_per_day = 4
    estimated_active_days = NUM_TRANSACTIONS / estimated_avg_trades_per_day
    
    # Calculate probability of trading on any given day
    trade_probability = min(1.0, estimated_active_days / len(trading_dates))
    
    # Calculate max trades per day to spread things out
    if NUM_TRANSACTIONS < len(trading_dates):
        # Very few transactions - spread thin, cap at 1-2 per day
        max_trades_per_day = 2
        trade_probability = min(1.0, NUM_TRANSACTIONS / len(trading_dates) * 1.5)
    elif NUM_TRANSACTIONS < len(trading_dates) * 2:
        # Low transactions - cap at 3 per day
        max_trades_per_day = 3
        trade_probability = min(1.0, NUM_TRANSACTIONS / (len(trading_dates) * 2) * 1.5)
    elif NUM_TRANSACTIONS < len(trading_dates) * 4:
        # Medium transactions - cap at 5 per day
        max_trades_per_day = 5
        trade_probability = 0.9
    else:
        # High transactions - no cap
        max_trades_per_day = None
        trade_probability = 1.0
    
    print(f"  Trade probability per day: {trade_probability:.2%}")
    print(f"  Max trades per day: {max_trades_per_day or 'unlimited'}")
    
    # Simulate each trading day
    for i, date in enumerate(trading_dates):
        simulator.simulate_day(date, trade_probability, max_trades_per_day)
        
        # Early exit if we've reached target (with some buffer)
        if len(simulator.transactions) >= NUM_TRANSACTIONS * 1.1:
            print(f"  Reached target at day {i + 1}/{len(trading_dates)}")
            break
        
        if (i + 1) % 50 == 0:
            print(f"  Processed {i + 1}/{len(trading_dates)} days, "
                  f"{len(simulator.transactions)} transactions so far...")
    
    # Get results
    df = simulator.get_transactions_df()
    
    # Trim to target if we overshot
    if len(df) > NUM_TRANSACTIONS:
        df = df.sample(n=NUM_TRANSACTIONS, random_state=SEED).sort_values('Timestamp').reset_index(drop=True)
    else:
        # Sort by timestamp
        df = df.sort_values('Timestamp').reset_index(drop=True)
    
    print(f"\nGenerated {len(df)} transactions")
    print(f"\nTransaction summary:")
    print(f"  Buy transactions: {len(df[df['Buy/Sell'] == 'Buy'])}")
    print(f"  Sell transactions: {len(df[df['Buy/Sell'] == 'Sell'])}")
    print(f"\nTickers traded:")
    print(df['Asset/Ticker'].value_counts().to_string())
    
    print(f"\nSample transactions:")
    print(df.head(10).to_string(index=False))
    
    # Save to CSV with auto-incrementing filename
    output_file = get_next_output_file()
    df.to_csv(output_file, index=False)
    print(f"\n✅ Saved to: {output_file}")
    
    # Print some behavioral pattern statistics
    print("\n" + "="*60)
    print("BEHAVIORAL PATTERNS IN DATA:")
    print("="*60)
    
    # Analyze trading frequency patterns
    df['Date'] = pd.to_datetime(df['Timestamp']).dt.date
    daily_counts = df.groupby('Date').size()
    
    print(f"\nOvertrading indicators:")
    print(f"  Average trades per day: {daily_counts.mean():.2f}")
    print(f"  Max trades in a day: {daily_counts.max()}")
    print(f"  Days with 5+ trades: {len(daily_counts[daily_counts >= 5])}")
    
    # Analyze buy patterns around price increases (FOMO)
    print(f"\nFOMO/Chasing patterns:")
    print(f"  Total buys: {len(df[df['Buy/Sell'] == 'Buy'])}")
    
    print(f"\nFinal portfolio value calculation would require tracking all positions")
    print(f"Remaining cash: ${simulator.cash:,.2f}")
    print(f"Positions held: {len(simulator.portfolio)} stocks")


if __name__ == "__main__":
    main()
