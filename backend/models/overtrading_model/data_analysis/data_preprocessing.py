# Auto-generated from data_preprocessing.ipynb

# %%
import pandas as pd
from pathlib import Path

# Load mock behaviors datasets
base_dir = Path("../../../")
mock_dir = base_dir / "mock_behaviors"
if not mock_dir.exists():
    # Backward-compat for existing folder name
    mock_dir = base_dir / "mock_behaviours"

# All training files live in mock_behaviours/ (*_example.csv)
files = sorted(mock_dir.glob("*_example.csv"))

files

# %%
# Load one dataset
sample_path = files[0] if files else None
sample_path

# %%
import math


def load_trades(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)
    df["notional"] = df["quantity"] * df["entry_price"]
    return df


df = load_trades(sample_path) if sample_path else pd.DataFrame()
df.head()

# %%
def compute_core_window_vector(
    df: pd.DataFrame,
    window_minutes: int = 15,
    stride_minutes: int = 5,
    eps: float = 1e-9,
) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values("timestamp")

    start = df["timestamp"].min().floor("min")
    end = df["timestamp"].max().ceil("min")

    window_starts = pd.date_range(start=start, end=end, freq=f"{stride_minutes}min", tz="UTC")

    rows = []
    for ws in window_starts:
        we = ws + pd.Timedelta(minutes=window_minutes)
        w = df[(df["timestamp"] >= ws) & (df["timestamp"] < we)].copy()

        n_trades = len(w)
        trade_rate_per_min = n_trades / window_minutes

        if n_trades >= 2:
            w["dt_prev_sec"] = w["timestamp"].diff().dt.total_seconds()
            gaps = w["dt_prev_sec"].dropna()
            median_gap_sec = float(gaps.median())
            mean_gap_sec = float(gaps.mean())
            gap_cv = float(gaps.std(ddof=0) / (gaps.mean() + eps))
            burst_frac = float((gaps <= 60).mean())
        else:
            median_gap_sec = float("nan")
            mean_gap_sec = float("nan")
            gap_cv = float("nan")
            burst_frac = float("nan")

        n_assets = int(w["asset"].nunique()) if n_trades else 0
        if n_trades:
            top_asset_share = float(w["asset"].value_counts(normalize=True).iloc[0])
        else:
            top_asset_share = float("nan")

        if n_trades >= 2:
            asset_switch_rate = float((w["asset"].iloc[1:].values != w["asset"].iloc[:-1].values).mean())
        else:
            asset_switch_rate = float("nan")

        notional_sum = float(w["notional"].sum()) if n_trades else 0.0
        if n_trades and "balance" in w.columns:
            window_start_balance = float(w["balance"].iloc[0])
            turnover = notional_sum / (window_start_balance + eps)
        else:
            turnover = float("nan")

        pnl_sum = float(w["profit_loss"].sum()) if n_trades else 0.0
        pnl_mean = float(w["profit_loss"].mean()) if n_trades else float("nan")
        pnl_std = float(w["profit_loss"].std()) if n_trades else float("nan")

        if n_trades:
            wins = w[w["profit_loss"] > 0]
            losses = w[w["profit_loss"] < 0]
            win_rate = float((w["profit_loss"] > 0).mean())
            avg_gain = float(wins["profit_loss"].mean()) if len(wins) else float("nan")
            avg_loss_abs = float(losses["profit_loss"].abs().mean()) if len(losses) else float("nan")
            payoff_ratio = avg_gain / (avg_loss_abs + eps) if not math.isnan(avg_gain) else float("nan")
            p90 = float(w["profit_loss"].quantile(0.90))
            p10 = float(w["profit_loss"].quantile(0.10))
            p50 = float(w["profit_loss"].quantile(0.50))
            pnl_skew_proxy = (p90 + p10) / (abs(p50) + eps)
        else:
            win_rate = float("nan")
            avg_gain = float("nan")
            avg_loss_abs = float("nan")
            payoff_ratio = float("nan")
            pnl_skew_proxy = float("nan")

        rows.append(
            {
                "window_start": ws,
                "window_end": we,
                "n_trades": n_trades,
                "trade_rate_per_min": trade_rate_per_min,
                "median_gap_sec": median_gap_sec,
                "mean_gap_sec": mean_gap_sec,
                "gap_cv": gap_cv,
                "burst_frac": burst_frac,
                "n_assets": n_assets,
                "top_asset_share": top_asset_share,
                "asset_switch_rate": asset_switch_rate,
                "turnover": turnover,
                "pnl_sum": pnl_sum,
                "pnl_mean": pnl_mean,
                "pnl_std": pnl_std,
                "win_rate": win_rate,
                "payoff_ratio": payoff_ratio,
                "pnl_skew_proxy": pnl_skew_proxy,
            }
        )

    return pd.DataFrame(rows)


core_windows = compute_core_window_vector(df, window_minutes=15, stride_minutes=5)
core_windows.head()

# %%
def add_overtrading_indicators_per_window(
    core_windows: pd.DataFrame,
    window_minutes: int = 15,
) -> pd.DataFrame:
    """Add overtrading indicators per window (session)."""
    if core_windows.empty:
        return pd.DataFrame()

    dfw = core_windows.copy().sort_values("window_start").reset_index(drop=True)

    # Per-window turnover per hour
    if "turnover" in dfw.columns:
        dfw["turnover_per_hour"] = dfw["turnover"] / (window_minutes / 60.0)
    else:
        dfw["turnover_per_hour"] = float("nan")

    return dfw


def build_training_df(
    files: list[Path],
    window_minutes: int = 15,
    stride_minutes: int = 5,
) -> pd.DataFrame:
    all_rows = []
    for path in files:
        df_local = load_trades(path)
        core = compute_core_window_vector(
            df_local, window_minutes=window_minutes, stride_minutes=stride_minutes
        )
        if core.empty:
            continue

        core["session_id"] = core["window_start"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        core["source_file"] = path.name
        core["is_calm"] = 1 if ("calm" in path.name or "balanced" in path.name) else 0

        core = add_overtrading_indicators_per_window(core, window_minutes=window_minutes)
        all_rows.append(core)

    return pd.concat(all_rows, ignore_index=True) if all_rows else pd.DataFrame()


training_df = build_training_df(files, window_minutes=15, stride_minutes=5)
training_df.head()


# %%
training_df.head()

# %%
# Save training data to CSV in this folder (absolute path)
output_path = Path("/Users/locsforstudygmail.com/Desktop/qhacks 2026/CogniTrade/backend/models/overtrading_model/data_analysis/data_preprocessing_training.csv")
if not training_df.empty:
    training_df.to_csv(output_path, index=False)
output_path

