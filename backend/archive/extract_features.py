import pandas as pd
from collections import deque
from datetime import timedelta

# ----------------------------
# Load & normalize data
# ----------------------------
# df = pd.read_csv("trades.csv")
df = pd.read_csv("C:\\Users\\johnl\\Documents\\CogniTrade\\backend\\mock_data\\fake_transactions_2.csv")

df["Timestamp"] = pd.to_datetime(df["Timestamp"])
df = df.sort_values("Timestamp").reset_index(drop=True)

# Derived columns
df["TradeValue"] = df["Amount"] * df["Price"]

# Output columns we will populate
df["AvgCostBasis"] = 0.0
df["PositionAfter"] = 0
df["RealizedPnL"] = 0.0
df["UnrealizedPnL"] = 0.0

lots_df = pd.DataFrame(columns=['BUY/SELL', 'Asset', 'Timestamp', 'Amount', 'Price', 'Holding Time', 'PnL'])

# ----------------------------
# Position & P/L tracking
# ----------------------------
positions = {}   # asset -> shares held
cost_basis = {}  # asset -> avg cost
lots = {}

for i, row in df.iterrows():
    asset = row["Asset"]
    qty = row["Amount"]
    price = row["Price"]
    side = row["BUY/SELL"]
    time = row['Timestamp']

    positions.setdefault(asset, 0)
    cost_basis.setdefault(asset, 0.0)
    lots.setdefault(asset, deque())

    if side == "BUY":
        total_cost = cost_basis[asset] * positions[asset] + qty * price
        positions[asset] += qty
        cost_basis[asset] = total_cost / positions[asset]

        lots[asset].append({
            "qty": qty,
            "entry_time": time,
            "entry_price": price
        })
        lots_df.loc[len(lots_df)] = ['BUY', asset, time, qty, price, 0, 0]

        df.at[i, "RealizedPnL"] = 0.0

    else:  # SELL
        if qty > positions[asset]:
            raise ValueError(f"SELL exceeds position for {asset}")

        realized = (price - cost_basis[asset]) * qty
        positions[asset] -= qty

        # Reset cost basis if flat
        if positions[asset] == 0:
            cost_basis[asset] = 0.0


        remaining_to_sell = qty
        while remaining_to_sell > 0:
            lot = lots[asset][0]  # oldest lot

            close_qty = min(lot["qty"], remaining_to_sell)

            holding_time = time - lot["entry_time"]
            realized_pnl = (price - lot["entry_price"]) * close_qty

            lots_df.loc[len(lots_df)] = ['SELL', asset, time, close_qty, price, holding_time, realized_pnl]

            lot["qty"] -= close_qty
            remaining_to_sell -= close_qty

            if lot["qty"] == 0:
                lots[asset].popleft()

        df.at[i, "RealizedPnL"] = realized

    df.at[i, "AvgCostBasis"] = cost_basis[asset]
    df.at[i, "PositionAfter"] = positions[asset]

print(positions)
print(cost_basis)

# ----------------------------
# Add rolling & contextual features
# ----------------------------

# Time since previous trade
df["TimeSincePrevTradeMin"] = (
    df["Timestamp"].diff().dt.total_seconds() / 60
).fillna(0)

# Rolling trade frequency
df["TradesLastHour"] = (
    df.rolling("60min", on="Timestamp")["Timestamp"].count()
)

# Rolling average trade size
df["RollingAvgAmount"] = (
    df["Amount"]
    .rolling(window=10, min_periods=1)
    .mean()
)

# Rolling P/L (realized)
df["RollingPnL"] = df["RealizedPnL"].rolling(10, min_periods=1).sum()

# ----------------------------
# Save enriched dataset
# ----------------------------
# df.to_csv("trades_enriched.csv", index=False)
# lots_df.to_csv("trade_lots.csv", index=False)
df.to_csv("trades_enriched1.csv", index=False)
lots_df.to_csv("trade_lots1.csv", index=False)

print("Analysis complete.")
print("Enriched dataset written to trades_enriched1.csv")
print("Trade lots written to trade_lots1.csv")
