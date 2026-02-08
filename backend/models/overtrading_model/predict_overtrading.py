import argparse
import math
from pathlib import Path

import joblib
import pandas as pd


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
            gap_cv = float(gaps.std() / (gaps.mean() + eps))
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
            asset_switch_rate = float((w["asset"].shift() != w["asset"]).mean())
        else:
            asset_switch_rate = float("nan")

        notional_sum = float(w["notional"].sum()) if n_trades else 0.0
        notional_mean = float(w["notional"].mean()) if n_trades else float("nan")
        notional_std = float(w["notional"].std()) if n_trades else float("nan")

        if n_trades and "balance" in w.columns:
            window_start_balance = float(w["balance"].iloc[0])
            turnover = notional_sum / (window_start_balance + eps)
            dd_max = (float(w["balance"].min()) - window_start_balance) / (
                window_start_balance + eps
            )
        else:
            window_start_balance = float("nan")
            turnover = float("nan")
            dd_max = float("nan")

        pnl_sum = float(w["profit_loss"].sum()) if n_trades else 0.0
        pnl_mean = float(w["profit_loss"].mean()) if n_trades else float("nan")
        pnl_std = float(w["profit_loss"].std()) if n_trades else float("nan")

        if n_trades:
            wins = w[w["profit_loss"] > 0]
            losses = w[w["profit_loss"] < 0]
            win_rate = float((w["profit_loss"] > 0).mean())
            avg_gain = float(wins["profit_loss"].mean()) if len(wins) else float("nan")
            avg_loss_abs = (
                float(losses["profit_loss"].abs().mean()) if len(losses) else float("nan")
            )
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
                "notional_sum": notional_sum,
                "notional_mean": notional_mean,
                "notional_std": notional_std,
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
            }
        )

    return pd.DataFrame(rows)


def add_overtrading_indicators_per_window(core_windows: pd.DataFrame, window_minutes: int = 15) -> pd.DataFrame:
    if core_windows.empty:
        return pd.DataFrame()

    dfw = core_windows.copy().sort_values("window_start").reset_index(drop=True)
    p90_trade_rate = float(dfw["trade_rate_per_min"].quantile(0.90))
    dfw["trade_rate_gt_p90"] = dfw["trade_rate_per_min"] > p90_trade_rate
    dfw["p90_trade_rate_global"] = p90_trade_rate

    if "turnover" in dfw.columns:
        dfw["turnover_per_hour"] = dfw["turnover"] / (window_minutes / 60.0)
    else:
        dfw["turnover_per_hour"] = float("nan")

    streak = 0
    streaks = []
    for is_hot in dfw["trade_rate_gt_p90"].tolist():
        if is_hot:
            streak += 1
        else:
            streak = 0
        streaks.append(streak)
    dfw["hot_streak_len"] = streaks

    return dfw


def build_features(
    df: pd.DataFrame,
    window_minutes: int = 15,
    stride_minutes: int = 5,
) -> pd.DataFrame:
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["notional"] = df["quantity"] * df["entry_price"]

    core = compute_core_window_vector(df, window_minutes=window_minutes, stride_minutes=stride_minutes)
    if core.empty:
        return core

    core = add_overtrading_indicators_per_window(core, window_minutes=window_minutes)
    return core


def align_features(feature_df: pd.DataFrame, schema_csv: Path | None) -> pd.DataFrame:
    drop_cols = {
        "window_start",
        "window_end",
        "session_id",
        "source_file",
        "is_calm",
    }
    if schema_csv and schema_csv.exists():
        schema_df = pd.read_csv(schema_csv, nrows=1)
        feature_cols = [c for c in schema_df.columns if c not in drop_cols]
        X = feature_df.reindex(columns=feature_cols)
    else:
        X = feature_df.drop(columns=[c for c in drop_cols if c in feature_df.columns])
    return X.fillna(0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Score overtrading windows from raw trade CSV.")
    parser.add_argument("--input", required=True, help="Raw trades CSV (timestamp,asset,side,quantity,entry_price,exit_price,profit_loss,balance).")
    parser.add_argument("--model", default="overtrading_model.joblib", help="Path to trained model joblib.")
    parser.add_argument("--schema", default="../data_analysis/data_preprocessing_training.csv", help="Feature schema CSV for column alignment.")
    parser.add_argument("--window-minutes", type=int, default=15)
    parser.add_argument("--stride-minutes", type=int, default=5)
    parser.add_argument("--output", default="overtrading_window_scores.csv")
    args = parser.parse_args()

    input_path = Path(args.input)
    model_path = Path(args.model)
    schema_path = Path(args.schema)

    df_raw = pd.read_csv(input_path)
    feature_df = build_features(df_raw, window_minutes=args.window_minutes, stride_minutes=args.stride_minutes)
    if feature_df.empty:
        raise SystemExit("No windows produced from input data.")

    X = align_features(feature_df, schema_path)

    model = joblib.load(model_path)
    if hasattr(model, "predict_proba"):
        scores = model.predict_proba(X)[:, 1]
    else:
        scores = model.predict(X)

    out = feature_df[["window_start", "window_end"]].copy()
    out["overtrading_score"] = scores
    out.to_csv(args.output, index=False)
    print(f"Wrote {args.output} with {len(out)} rows")


if __name__ == "__main__":
    main()
