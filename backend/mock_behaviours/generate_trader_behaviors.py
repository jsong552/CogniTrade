# generate_trader_behaviors.py
#
# Generates synthetic trade CSV datasets using OBSERVABLE, MEASURABLE parameters
# rather than hard-coded "behavior types." Each user profile is subjective;
# this generator produces data that exhibits patterns your app can detect from
# raw metrics (e.g. trades per hour, hold time of losers vs winners, size after loss).
#
# Document-aligned patterns:
#   • Overtrading: excessive trades vs balance, frequent position switching,
#     trading after big P/L, time clustering (many trades in one hour).
#   • Loss aversion: letting losers run long, closing winners early,
#     unbalanced risk/reward, avg loss > avg win.
#   • Revenge: larger trades after a loss, increased risk after loss streaks.
#
# Columns: timestamp, asset, side, quantity, entry_price, exit_price, profit_loss, balance

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd


# -----------------------------
# Config
# -----------------------------

ASSETS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "BTC-USD", "ETH-USD", "EURUSD", "GBPUSD"]
START_BALANCE = 10_000.00
START_TIME_UTC = datetime(2025, 1, 1, 13, 30, tzinfo=timezone.utc)
SEED = 42

random.seed(SEED)
np.random.seed(SEED)


@dataclass
class Trade:
    timestamp: datetime
    asset: str
    side: str
    quantity: float
    entry_price: float
    exit_price: float
    profit_loss: float
    balance: float


# -----------------------------
# Trader profile: observable parameters only (0 = low, 1 = high)
# No labels like "calm" or "overtrader"—each user has their own mix.
# -----------------------------

@dataclass
class TraderProfile:
    """Strength of observable tendencies. All in [0, 1] unless noted."""

    # ---- Overtrading ----
    # Base trade frequency (0 = sparse, 1 = very frequent)
    trade_frequency: float = 0.3
    # How often we switch to a different asset (0 = stick to one, 1 = switch often)
    position_switch_rate: float = 0.5
    # Trade again sooner after a large |P/L| (0 = no reaction, 1 = strong)
    reactive_after_big_pnl: float = 0.0
    # Time clustering: 0 = even spacing, 1 = bursty (many trades in short windows)
    time_clustering: float = 0.0

    # ---- Loss aversion ----
    # Hold losing positions longer before realizing (0 = cut quickly, 1 = let run)
    hold_losers_longer: float = 0.0
    # Close winners early / small take-profits (0 = let run, 1 = quick small wins)
    close_winners_early: float = 0.0
    # Unbalanced risk/reward: 0 = symmetric, 1 = avg loss size > avg win size
    loss_size_vs_win_size: float = 0.0

    # ---- Revenge ----
    # Increase position size immediately after a loss (0 = no, 1 = strong)
    size_increase_after_loss: float = 0.0
    # Increase size/risk further after consecutive losses (0 = no, 1 = strong)
    risk_increase_after_streak: float = 0.0


# -----------------------------
# Helpers
# -----------------------------

def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def round_qty(q: float) -> float:
    if q >= 1:
        return round(q, 4)
    return round(q, 6)


def round_px(p: float) -> float:
    if p >= 1000:
        return round(p, 2)
    if p >= 10:
        return round(p, 4)
    return round(p, 6)


def _lerp(lo: float, hi: float, t: float) -> float:
    return lo + (hi - lo) * clamp(t, 0.0, 1.0)


# -----------------------------
# Parameterized logic (profile-driven, no hard behavior labels)
# -----------------------------

def pick_asset(
    profile: TraderProfile,
    last_asset: str | None,
    last_pnl: float,
    loss_streak: int,
) -> str:
    # High position_switch_rate → often switch; low → often same asset.
    # After a loss, revenge-like behavior = stick to same asset (reduce switch rate)
    switch_rate = profile.position_switch_rate
    if last_pnl < 0 and (profile.size_increase_after_loss > 0 or profile.risk_increase_after_streak > 0):
        # More likely to stay on same asset after loss when revenge traits present
        switch_rate *= 1.0 - 0.7 * max(profile.size_increase_after_loss, profile.risk_increase_after_streak)
    if last_asset is not None and random.random() > switch_rate:
        return last_asset
    return random.choice(ASSETS)


def next_time_delta(
    profile: TraderProfile,
    last_pnl: float,
    last_notional: float,
    balance: float,
) -> timedelta:
    # Base interval: trade_frequency (high → short intervals)
    # Base range: ~2 min to 72 h; frequency shortens the typical gap
    base_min = _lerp(90.0, 2.0, profile.trade_frequency)   # minutes
    base_max = _lerp(72 * 60.0, 30.0, profile.trade_frequency)
    gap_minutes = random.uniform(base_min, base_max)

    # Reactive after big P/L: trade again sooner after large |P/L|
    if last_notional > 0 and balance > 0:
        pnl_ratio = abs(last_pnl) / balance
        if pnl_ratio > 0.01 and profile.reactive_after_big_pnl > 0:
            gap_minutes *= 1.0 - 0.6 * profile.reactive_after_big_pnl * min(1.0, pnl_ratio * 20)
    gap_minutes = max(0.5, gap_minutes)

    # Time clustering: with probability time_clustering, use a much shorter gap (burst)
    if profile.time_clustering > 0 and random.random() < profile.time_clustering:
        gap_minutes = random.uniform(0.5, 15.0)
    return timedelta(minutes=gap_minutes)


def sample_return_and_hold(
    profile: TraderProfile,
    last_pnl: float,
    loss_streak: int,
) -> Tuple[float, float]:
    """
    Returns (move_pct, hold_minutes).
    Produces observable loss-aversion patterns when profile params are high.
    """
    # Decide if this trade will be a win or loss (roughly 50/50 base)
    is_win = random.random() < 0.5

    if is_win:
        # Win size: close_winners_early high → small wins
        max_win = _lerp(0.015, 0.004, profile.close_winners_early)
        move = random.uniform(0.001, max_win)
        hold_minutes = random.uniform(30, 8 * 60)
    else:
        # Loss size: loss_size_vs_win_size high → larger losses on average
        max_loss = _lerp(0.012, 0.06, profile.loss_size_vs_win_size)
        move = -random.uniform(0.002, max_loss)
        # hold_losers_longer → hold losing positions longer before exit
        hold_base = _lerp(60.0, 24 * 60.0, profile.hold_losers_longer)
        hold_minutes = random.uniform(hold_base * 0.5, hold_base * 2.0)

    # Add noise
    move += float(np.random.normal(0, 0.002))
    move = clamp(move, -0.15, 0.10)
    return float(move), float(hold_minutes)


def transaction_cost(notional: float, profile: TraderProfile) -> float:
    # Slightly higher cost when high frequency / reactive (more slippage in bursts)
    base_bps = 8
    extra = (profile.trade_frequency + profile.time_clustering) * 12
    return notional * (base_bps + extra) / 1e4 * 2.0  # round-trip


def size_quantity(
    balance: float,
    entry_price: float,
    profile: TraderProfile,
    last_pnl: float,
    loss_streak: int,
) -> float:
    # Base size: 2–8% of balance (neutral)
    base_frac = random.uniform(0.02, 0.08)

    # Revenge: larger size after a loss
    if last_pnl < 0:
        size_bump = profile.size_increase_after_loss * random.uniform(0.5, 1.5)
        streak_bump = profile.risk_increase_after_streak * min(loss_streak, 6) * 0.15
        base_frac *= 1.0 + size_bump + streak_bump
    base_frac = clamp(base_frac, 0.01, 0.60)

    notional = balance * base_frac
    qty = notional / max(entry_price, 1e-9)
    return round_qty(qty)


# -----------------------------
# Main simulator
# -----------------------------

def generate_dataset(
    profile: TraderProfile,
    n_trades: int,
    start_balance: float,
    start_time: datetime,
    base_prices: Dict[str, float],
) -> pd.DataFrame:
    rows: List[Trade] = []
    balance = float(start_balance)
    t = start_time
    last_pnl = 0.0
    last_notional = 0.0
    last_asset: str | None = None
    loss_streak = 0
    prices = dict(base_prices)

    for _ in range(n_trades):
        t += next_time_delta(profile, last_pnl, last_notional, balance)
        asset = pick_asset(profile, last_asset, last_pnl, loss_streak)
        side = random.choice(["buy", "sell"])

        entry = max(float(prices.get(asset, 100.0)), 0.01)
        qty = size_quantity(balance, entry, profile, last_pnl, loss_streak)
        last_notional = entry * qty

        move_pct, _ = sample_return_and_hold(profile, last_pnl, loss_streak)
        exit_px = max(entry * (1.0 + move_pct), 0.0001)

        gross = (exit_px - entry) * qty if side == "buy" else (entry - exit_px) * qty
        cost = transaction_cost(last_notional, profile)
        pnl = gross - cost
        balance = balance + pnl

        if balance < 50:
            balance = 50.0 + random.uniform(0, 20)

        last_pnl = pnl
        last_asset = asset
        loss_streak = loss_streak + 1 if pnl < 0 else 0
        prices[asset] = float(exit_px)

        rows.append(
            Trade(
                timestamp=t,
                asset=asset,
                side=side,
                quantity=float(qty),
                entry_price=float(round_px(entry)),
                exit_price=float(round_px(exit_px)),
                profit_loss=float(round(pnl, 2)),
                balance=float(round(balance, 2)),
            )
        )

    df = pd.DataFrame([r.__dict__ for r in rows])
    df["timestamp"] = df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df = df[
        ["timestamp", "asset", "side", "quantity", "entry_price", "exit_price", "profit_loss", "balance"]
    ]
    return df


# -----------------------------
# Example profiles (for generating sample CSVs)
# These are *example* parameter mixes that exhibit document patterns;
# real users would have their own profile inferred from data.
# -----------------------------

def example_profile_overtrading() -> TraderProfile:
    return TraderProfile(
        trade_frequency=0.85,
        position_switch_rate=0.8,
        reactive_after_big_pnl=0.7,
        time_clustering=0.6,
        hold_losers_longer=0.0,
        close_winners_early=0.2,
        loss_size_vs_win_size=0.0,
        size_increase_after_loss=0.0,
        risk_increase_after_streak=0.0,
    )


def example_profile_loss_averse() -> TraderProfile:
    return TraderProfile(
        trade_frequency=0.25,
        position_switch_rate=0.4,
        reactive_after_big_pnl=0.0,
        time_clustering=0.0,
        hold_losers_longer=0.8,
        close_winners_early=0.75,
        loss_size_vs_win_size=0.85,
        size_increase_after_loss=0.0,
        risk_increase_after_streak=0.0,
    )


def example_profile_revenge() -> TraderProfile:
    return TraderProfile(
        trade_frequency=0.5,
        position_switch_rate=0.3,
        reactive_after_big_pnl=0.6,
        time_clustering=0.4,
        hold_losers_longer=0.2,
        close_winners_early=0.2,
        loss_size_vs_win_size=0.3,
        size_increase_after_loss=0.9,
        risk_increase_after_streak=0.85,
    )


def example_profile_balanced() -> TraderProfile:
    return TraderProfile(
        trade_frequency=0.35,
        position_switch_rate=0.5,
        reactive_after_big_pnl=0.1,
        time_clustering=0.1,
        hold_losers_longer=0.2,
        close_winners_early=0.2,
        loss_size_vs_win_size=0.2,
        size_increase_after_loss=0.0,
        risk_increase_after_streak=0.0,
    )


def main() -> None:
    base_prices = {
        "AAPL": 180.0,
        "MSFT": 410.0,
        "NVDA": 650.0,
        "TSLA": 220.0,
        "AMZN": 170.0,
        "BTC-USD": 45_000.0,
        "ETH-USD": 2_400.0,
        "EURUSD": 1.09,
        "GBPUSD": 1.27,
    }

    # Example datasets: each is one possible mix of observable parameters
    specs = [
        ("overtrading_example", example_profile_overtrading(), 4500),
        ("loss_averse_example", example_profile_loss_averse(), 1400),
        ("revenge_example", example_profile_revenge(), 2200),
        ("balanced_example", example_profile_balanced(), 1200),
    ]

    for name, profile, n in specs:
        df = generate_dataset(
            profile=profile,
            n_trades=n,
            start_balance=START_BALANCE,
            start_time=START_TIME_UTC,
            base_prices=base_prices,
        )
        out = f"{name}.csv"
        df.to_csv(out, index=False)
        print(f"Wrote {out} with {len(df)} rows")

    print("\nExample rows from revenge_example.csv:")
    print(pd.read_csv("revenge_example.csv").head(5))


if __name__ == "__main__":
    main()
