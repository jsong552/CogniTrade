import pandas as pd
from collections import deque
from datetime import timedelta


def extract_derived_features(f):
    # ----------------------------
    # Preprocess data
    # ----------------------------
    # df = pd.read_csv(f'trading_datasets\\{f}.csv', usecols=keep_cols)
    keep_cols = ['timestamp', 'asset', 'side', 'quantity', 'entry_price', 'exit_price', 'profit_loss', 'balance']
    df = pd.read_csv(f, usecols=keep_cols)

    df.dropna(subset=['timestamp'])
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)

    # Handle missing core values
    trade_fields = ['quantity', 'entry_price', 'exit_price', 'profit_loss']
    valid_mask = df[trade_fields].notna().sum(axis=1) >= 3
    df = df[valid_mask].copy()

    df['quantity'] = df['quantity'].fillna(df['profit_loss'] / (df['exit_price'] - df['entry_price']))
    df['entry_price'] = df['entry_price'].fillna(-(df['profit_loss'] / df['quantity'] - df['exit_price']))
    df['exit_price'] = df['exit_price'].fillna(df['profit_loss'] / df['quantity'] + df['entry_price'])
    df['profit_loss'] = df['profit_loss'].fillna((df['exit_price'] - df['entry_price']) * df['quantity'])

    # Time
    df['TradeDate'] = df['timestamp'].dt.date
    df['TradeTime'] = df['timestamp'].dt.time
    df['MinsSinceLastTrade'] = (df['timestamp'].diff().dt.total_seconds() / 60).fillna(0)

    # Risk / Intensity
    df['TradeSize'] = df['quantity'] * df['entry_price']
    df['TradeSizePctBalance'] = df['TradeSize'] / df['balance']

    # P&L Context
    df['IsWin'] = df['profit_loss'] >= 0
    df['PnLPercent'] = df['profit_loss'] / (df['TradeSize'])

    print(len(df['timestamp']))
    print(len(df['timestamp'].unique()))

    # ----------------------------
    # Add rolling & contextual features
    # ----------------------------

    df['TradesLast15Min'] = (df.rolling('15min', on='timestamp')['timestamp'].count())
    df['TradesLastHour'] = (df.rolling('60min', on='timestamp')['timestamp'].count())

    df['RollingAvgPnLPercent_5'] = (df['PnLPercent'].rolling(window=5, min_periods=1).mean())
    df['RollingAvgTradeSize_5'] = (df['TradeSize'].rolling(window=5, min_periods=1).mean())

    # # Rolling P/L (realized)
    # df['RollingPnL'] = df['RealizedPnL'].rolling(10, min_periods=1).sum()

    # Identify loss streak boundaries
    streak_id = df['IsWin'].shift(fill_value=True).cumsum()

    # Count losses within each streak
    df['LossStreak'] = ((~df['IsWin']).groupby(streak_id).cumsum())

    # Explicitly zero out non-loss rows
    df.loc[df['IsWin'], 'LossStreak'] = 0

    return df

if __name__ == '__main__':
    file_names = ['calm_trader', 'loss_averse_trader', 'overtrader', 'revenge_trader']
    file_names = ['balanced_example', 'loss_averse_example', 'overtrading_example', 'revenge_example']

    for f in file_names:
        df = extract_derived_features(f'mock_behaviours\\{f}.csv')
        # ----------------------------
        # Save enriched dataset
        # ----------------------------
        df.to_csv(f'{f}_enriched.csv', index=False)

        print(df)

        print('Analysis complete.')
        print(f'Enriched dataset written to {f}_enriched.csv')


        '''
        overtrade_flag = trades_in_last_15m > user_baseline
        
        overtrading_score = trades_per_day / median_trades_per_day
        overtrading = score > 1.5

        “You trade 2.3× more frequently than your typical baseline, often clustering trades within minutes.”
        '''
        # df['overtrade_flag_15m'] = df['TradesLast15Min'] > df['TradesLast15Min'].median() * 1.5
        # df['size_overtrade_flag'] = (df['TradeSizePctBalance'] > 0.1) | (df['TradeSizePctBalance'] < 0.1)


        # median_trades_per_day = (df.groupby('TradeDate').size().median())

        
        '''
        loss_aversion_flag = profit_loss < 0 AND abs(profit_loss) > avg_gain

        loss_aversion = loss_gain_ratio > 1.3

        “Your losing trades are, on average, 1.6× larger than your winning trades.”
        '''

        '''
        revenge_trade_flag = previous_trade_pnl < -threshold AND minutes_since_last_trade < 15  AND trade_size_pct_balance increased

        revenge_trade_rate = revenge_trades / total_trades
        revenge_trading = rate > 0.2

        “42% of your trades placed within 10 minutes of a loss were unprofitable.”
        '''

        # print(median_trades_per_day)

        