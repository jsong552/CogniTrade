import pandas as pd

def detect_revenge_trading(df):
    flags = []

    for i in range(1, len(df)):
        prev = df.iloc[i - 1]
        curr = df.iloc[i]

        if (
            prev["RealizedPnL"] < -50 and
            curr["TimeSincePrevTradeMin"] < 15 and
            curr["Amount"] > curr["RollingAvgAmount"]
        ):
            flags.append("REVENGE")
        else:
            flags.append("")

    flags.insert(0, "")
    df["DetectedBias"] = flags

trades_df = pd.read_csv('trades_enriched.csv')
tradeLots_df = pd.read_csv('trade_lots.csv')

trades_df["Timestamp"] = pd.to_datetime(trades_df["Timestamp"])
trades_df["trade_date"] = trades_df["Timestamp"].dt.date
tradeLots_df['Holding Time'] = pd.to_timedelta(tradeLots_df['Holding Time'])

median_trades_per_day = (
    trades_df
    .groupby("trade_date")
    .size()
    .median()
)

gains = trades_df[trades_df["RealizedPnL"] > 0]
avg_gain = gains["RealizedPnL"].mean()

losses = trades_df[trades_df["RealizedPnL"] < 0]
avg_loss = losses["RealizedPnL"].mean()

gains = tradeLots_df[tradeLots_df['PnL'] > 0]
avg_win_hold_mins = sum(gains['Amount'] * gains['Holding Time'].dt.total_seconds()) / sum(gains['Amount']) / 60

losses = tradeLots_df[tradeLots_df['PnL'] < 0]
avg_loss_hold_mins = sum(losses['Amount'] * losses['Holding Time'].dt.total_seconds()) / sum(losses['Amount']) / 60


print({
    'median_trades_per_day': median_trades_per_day,
    'avg_gain': avg_gain,
    'avg_loss': avg_loss,
    'avg_win_hold_mins': avg_win_hold_mins,
    'avg_loss_hold_mins': avg_loss_hold_mins
})



# detect_revenge_trading(df)
# # print(pd.crosstab(df["DetectedBias"], df["HiddenBiasLabel"]))
# print(df)