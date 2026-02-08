"""Score loss aversion from raw trade data.

Uses a sliding-window approach:
- 30-trade windows with 10-trade stride
- Computes core features + loss-aversion-specific indicators
  (small_gain_frac, large_loss_frac, loss_tail_ratio, asymmetry_index,
   gain_clipping)
- Returns per-window loss aversion probability.

Public API: ``score_loss_aversion(df)``
"""

import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_THIS_DIR = Path(__file__).resolve().parent
_DEFAULT_MODEL = _THIS_DIR / "loss_aversion_model.joblib"

_BACKEND_DIR = _THIS_DIR.parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


# ---------------------------------------------------------------------------
# Feature helpers  (mirrors training_pipeline.ipynb)
# ---------------------------------------------------------------------------

def _enrich_trades(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived columns expected by the loss-aversion feature extractor."""
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)

    df["MinsSinceLastTrade"] = (
        df["timestamp"].diff().dt.total_seconds() / 60
    ).fillna(0)
    df["TradeSize"] = df["quantity"] * df["entry_price"]
    df["IsWin"] = df["profit_loss"] >= 0
    df["PnLPercent"] = df["profit_loss"] / df["TradeSize"]
    return df


def _compute_core_window_vector(win: pd.DataFrame, eps: float = 1e-9) -> dict:
    """Compute core + loss-aversion features for a single window."""
    if win.empty:
        return {}

    start = win.iloc[0]["timestamp"]
    end = win.iloc[-1]["timestamp"]

    n_trades = len(win)
    window_minutes = max((end - start).total_seconds() / 60, 1e-6)
    trade_rate_per_min = n_trades / window_minutes

    gaps_sec = win["MinsSinceLastTrade"] * 60
    median_gap_sec = float(gaps_sec.median())
    mean_gap_sec = float(gaps_sec.mean())
    burst_frac = float((gaps_sec <= 60).mean())

    n_assets = int(win["asset"].nunique())
    top_asset_share = float(win["asset"].value_counts(normalize=True).iloc[0])

    asset_changes = win["asset"].ne(win["asset"].shift()).sum() - 1
    asset_switch_rate = float(asset_changes / max(n_trades - 1, 1))

    sizing = win["TradeSize"]
    sizing_sum = float(sizing.sum())
    sizing_mean = float(sizing.mean())
    sizing_std = float(sizing.std()) if n_trades >= 2 else 0.0

    window_start_balance = float(win.iloc[0]["balance"])
    turnover = sizing_sum / (window_start_balance + eps)

    pnl = win["profit_loss"]
    pnl_sum = float(pnl.sum())
    pnl_mean = float(pnl.mean())
    pnl_std = float(pnl.std()) if n_trades >= 2 else 0.0

    win_rate = float(win["IsWin"].mean())
    positive_pnl = pnl[pnl > 0]
    avg_gain = float(positive_pnl.mean()) if not positive_pnl.empty else 0.0
    negative_pnl = pnl[pnl < 0]
    avg_loss_abs = float(negative_pnl.abs().mean()) if not negative_pnl.empty else 0.0
    payoff_ratio = avg_gain / (avg_loss_abs + eps)

    pnl_skew_proxy = float(
        (pnl.quantile(0.9) + pnl.quantile(0.1)) / (abs(pnl.quantile(0.5)) + eps)
    )

    min_balance = float(win["balance"].min())
    dd_max = (min_balance - window_start_balance) / (window_start_balance + eps)

    # ---- Loss-aversion-specific indicators ----
    small_gain_frac = float(
        ((win["IsWin"]) & (win["PnLPercent"] < 0.002)).mean()
    )
    large_loss_frac = float((win["PnLPercent"] < -0.005).mean())

    loss_trades = win.loc[~win["IsWin"], "profit_loss"]
    win_trades = win.loc[win["IsWin"], "profit_loss"]
    loss_tail_ratio = float(
        loss_trades.abs().quantile(0.9) / (win_trades.quantile(0.9) + eps)
        if not loss_trades.empty and not win_trades.empty
        else 0.0
    )

    asymmetry_index = float(
        (avg_loss_abs - avg_gain) / (avg_loss_abs + avg_gain + eps)
    )

    gain_clipping = float(
        positive_pnl.quantile(0.5) / (positive_pnl.quantile(0.95) + eps)
        if not positive_pnl.empty and len(positive_pnl) >= 2
        else 0.0
    )

    return {
        "n_trades": n_trades,
        "trade_rate_per_min": trade_rate_per_min,
        "median_gap_sec": median_gap_sec,
        "mean_gap_sec": mean_gap_sec,
        "burst_frac": burst_frac,
        "n_assets": n_assets,
        "top_asset_share": top_asset_share,
        "asset_switch_rate": asset_switch_rate,
        "sizing_sum": sizing_sum,
        "sizing_mean": sizing_mean,
        "sizing_std": sizing_std,
        "turnover": turnover,
        "pnl_sum": pnl_sum,
        "pnl_mean": pnl_mean,
        "pnl_std": pnl_std,
        "win_rate": win_rate,
        "avg_gain": avg_gain,
        "avg_loss_abs": avg_loss_abs,
        "payoff_ratio": payoff_ratio,
        "pnl_skew_proxy": pnl_skew_proxy,
        "dd_max": dd_max,
        "window_start_balance": window_start_balance,
        # Loss-aversion indicators
        "small_gain_frac": small_gain_frac,
        "large_loss_frac": large_loss_frac,
        "loss_tail_ratio": loss_tail_ratio,
        "asymmetry_index": asymmetry_index,
        "gain_clipping": gain_clipping,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

WIN_SIZE = 30
WIN_STRIDE = 10
MIN_WIN = 3


def score_loss_aversion(
    df: pd.DataFrame,
    model_path: Path | str | None = None,
) -> dict:
    """Score a raw trades DataFrame for loss aversion.

    Parameters
    ----------
    df : pd.DataFrame
        Raw trades with columns: timestamp, asset, side, quantity,
        entry_price, exit_price, profit_loss, balance.
    model_path : Path, optional
        Path to the trained model joblib.

    Returns
    -------
    dict with keys:
        - windows: list of {window_start, window_end, loss_aversion_score}
        - avg_score: float mean loss aversion score
    """
    model_path = Path(model_path) if model_path else _DEFAULT_MODEL

    enriched = _enrich_trades(df)

    # Load model artifact
    artifact = joblib.load(model_path)
    model = artifact["model"]
    feature_keys = artifact["feature_keys"]

    samples = []
    meta = []
    start = 0
    while start + MIN_WIN < len(enriched):
        end = min(start + WIN_SIZE, len(enriched))
        window = enriched.iloc[start:end]

        if len(window) > MIN_WIN:
            vec = _compute_core_window_vector(window)
            if vec:
                samples.append(vec)
                meta.append(
                    {
                        "window_start": str(window.iloc[0]["timestamp"]),
                        "window_end": str(window.iloc[-1]["timestamp"]),
                    }
                )
        start += WIN_STRIDE

    if not samples:
        return {"windows": [], "avg_score": 0.0, "feature_columns": [], "feature_data": []}

    X_df = pd.DataFrame(samples).reindex(columns=feature_keys).fillna(0)
    X = X_df.to_numpy(dtype=float)

    if hasattr(model, "predict_proba"):
        scores = model.predict_proba(X)[:, 1]
    else:
        scores = model.predict(X).astype(float)

    windows = []
    for i, m in enumerate(meta):
        windows.append(
            {
                **m,
                "loss_aversion_score": round(float(scores[i]), 4),
            }
        )

    # Build feature table for UI display
    feature_table = X_df.copy()
    feature_table.insert(0, "window_start", [m["window_start"] for m in meta])
    feature_table.insert(1, "window_end", [m["window_end"] for m in meta])
    feature_table["loss_aversion_prob"] = scores
    feature_records = feature_table.round(4).fillna("NaN").to_dict(orient="records")

    return {
        "windows": windows,
        "avg_score": round(float(scores.mean()), 4),
        "feature_columns": list(feature_table.columns),
        "feature_data": feature_records[:200],
    }
