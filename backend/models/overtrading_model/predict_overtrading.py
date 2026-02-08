"""Score overtrading windows from raw trade data.

Can be used as a CLI script or imported for programmatic access via
``score_overtrading(df)``.
"""

import argparse
import math
from pathlib import Path

import joblib
import pandas as pd

# ---------------------------------------------------------------------------
# Default model path (relative to *this* file)
# ---------------------------------------------------------------------------
_THIS_DIR = Path(__file__).resolve().parent
_DEFAULT_MODEL = _THIS_DIR / "model_training" / "overtrading_model.joblib"


# ---------------------------------------------------------------------------
# Feature engineering  (synced with data_preprocessing.py)
# ---------------------------------------------------------------------------

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
    window_starts = pd.date_range(
        start=start, end=end, freq=f"{stride_minutes}min", tz="UTC"
    )

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
            top_asset_share = float(
                w["asset"].value_counts(normalize=True).iloc[0]
            )
        else:
            top_asset_share = float("nan")

        if n_trades >= 2:
            asset_switch_rate = float(
                (w["asset"].iloc[1:].values != w["asset"].iloc[:-1].values).mean()
            )
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
            avg_gain = (
                float(wins["profit_loss"].mean()) if len(wins) else float("nan")
            )
            avg_loss_abs = (
                float(losses["profit_loss"].abs().mean())
                if len(losses)
                else float("nan")
            )
            payoff_ratio = (
                avg_gain / (avg_loss_abs + eps)
                if not math.isnan(avg_gain)
                else float("nan")
            )
            p90 = float(w["profit_loss"].quantile(0.90))
            p10 = float(w["profit_loss"].quantile(0.10))
            p50 = float(w["profit_loss"].quantile(0.50))
            pnl_skew_proxy = (p90 + p10) / (abs(p50) + eps)
        else:
            win_rate = float("nan")
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


def add_overtrading_indicators_per_window(
    core_windows: pd.DataFrame,
    window_minutes: int = 15,
) -> pd.DataFrame:
    if core_windows.empty:
        return pd.DataFrame()

    dfw = core_windows.copy().sort_values("window_start").reset_index(drop=True)

    if "turnover" in dfw.columns:
        dfw["turnover_per_hour"] = dfw["turnover"] / (window_minutes / 60.0)
    else:
        dfw["turnover_per_hour"] = float("nan")

    return dfw


def build_features(
    df: pd.DataFrame,
    window_minutes: int = 15,
    stride_minutes: int = 5,
) -> pd.DataFrame:
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["notional"] = df["quantity"] * df["entry_price"]

    core = compute_core_window_vector(
        df, window_minutes=window_minutes, stride_minutes=stride_minutes
    )
    if core.empty:
        return core

    core = add_overtrading_indicators_per_window(core, window_minutes=window_minutes)
    return core


def align_features(feature_df: pd.DataFrame) -> pd.DataFrame:
    """Select exactly the 11 features the trained model expects, in order."""
    # These must match the columns the model was trained on (model_training.ipynb cell 4).
    _MODEL_FEATURES = [
        "trade_rate_per_min",
        "median_gap_sec",
        "mean_gap_sec",
        "gap_cv",
        "burst_frac",
        "n_assets",
        "top_asset_share",
        "asset_switch_rate",
        "pnl_std",
        "pnl_skew_proxy",
        "turnover_per_hour",
    ]
    X = feature_df.reindex(columns=_MODEL_FEATURES)
    return X


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_overtrading(
    df: pd.DataFrame,
    model_path: Path | str | None = None,
    window_minutes: int = 15,
    stride_minutes: int = 5,
) -> dict:
    """Score a raw trades DataFrame for overtrading.

    Parameters
    ----------
    df : pd.DataFrame
        Raw trades with columns: timestamp, asset, side, quantity,
        entry_price, exit_price, profit_loss, balance.
    model_path : Path, optional
        Path to the trained model joblib. Defaults to the bundled model.

    Returns
    -------
    dict with keys:
        - windows: list of {window_start, window_end, overtrading_score}
        - avg_score: float mean overtrading score
    """
    model_path = Path(model_path) if model_path else _DEFAULT_MODEL

    feature_df = build_features(
        df, window_minutes=window_minutes, stride_minutes=stride_minutes
    )
    if feature_df.empty:
        return {"windows": [], "avg_score": 0.0}

    X = align_features(feature_df)

    model = joblib.load(model_path)
    if hasattr(model, "predict_proba"):
        scores = model.predict_proba(X)[:, 1]
    else:
        scores = model.predict(X).astype(float)

    windows = []
    for i, row in feature_df.iterrows():
        windows.append(
            {
                "window_start": str(row["window_start"]),
                "window_end": str(row["window_end"]),
                "overtrading_score": round(float(scores[i]), 4),
            }
        )

    # Build feature table for UI display (include score as last column)
    feature_table = X.copy()
    feature_table.insert(0, "window_start", feature_df["window_start"].astype(str).values)
    feature_table.insert(1, "window_end", feature_df["window_end"].astype(str).values)
    feature_table["overtrading_prob"] = scores
    feature_records = feature_table.round(4).fillna("NaN").to_dict(orient="records")

    return {
        "windows": windows,
        "avg_score": round(float(scores.mean()), 4),
        "feature_columns": list(feature_table.columns),
        "feature_data": feature_records[:200],  # cap for payload size
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Score overtrading windows from raw trade CSV."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Raw trades CSV (timestamp, asset, side, quantity, entry_price, exit_price, profit_loss, balance).",
    )
    parser.add_argument(
        "--model",
        default=str(_DEFAULT_MODEL),
        help="Path to trained model joblib.",
    )
    parser.add_argument("--window-minutes", type=int, default=15)
    parser.add_argument("--stride-minutes", type=int, default=5)
    parser.add_argument("--output", default="overtrading_window_scores.csv")
    args = parser.parse_args()

    df_raw = pd.read_csv(args.input)
    result = score_overtrading(
        df_raw,
        model_path=args.model,
        window_minutes=args.window_minutes,
        stride_minutes=args.stride_minutes,
    )

    if not result["windows"]:
        raise SystemExit("No windows produced from input data.")

    out = pd.DataFrame(result["windows"])
    out.to_csv(args.output, index=False)
    print(f"Wrote {args.output} with {len(out)} rows  (avg_score={result['avg_score']:.4f})")


if __name__ == "__main__":
    main()
