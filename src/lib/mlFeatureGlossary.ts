/**
 * ML feature column glossary: normalized display name and definition for hover tooltips.
 * Keys are the raw column names from the backend (e.g. overtrading_features, revenge_features, loss_aversion_features).
 */
export const ML_FEATURE_GLOSSARY: Record<
  string,
  { label: string; definition: string }
> = {
  // ---- Time / window ----
  window_start: {
    label: "Window start",
    definition: "Start timestamp of the analysis window (UTC).",
  },
  window_end: {
    label: "Window end",
    definition: "End timestamp of the analysis window (UTC).",
  },

  // ---- Activity & timing ----
  trade_rate_per_min: {
    label: "Trade rate (per min)",
    definition: "Number of trades per minute in the window.",
  },
  median_gap_sec: {
    label: "Median gap (sec)",
    definition: "Median time in seconds between consecutive trades.",
  },
  mean_gap_sec: {
    label: "Mean gap (sec)",
    definition: "Mean time in seconds between consecutive trades.",
  },
  gap_cv: {
    label: "Gap coefficient of variation",
    definition:
      "Standard deviation of inter-trade gaps divided by mean gap; higher values mean more irregular timing.",
  },
  burst_frac: {
    label: "Burst fraction",
    definition:
      "Fraction of inter-trade gaps ≤ 60 seconds (trades in quick succession).",
  },

  // ---- Diversification ----
  n_assets: {
    label: "Number of assets",
    definition: "Count of distinct assets (symbols) traded in the window.",
  },
  top_asset_share: {
    label: "Top asset share",
    definition:
      "Share of trades in the most-traded asset (0–1). Higher = more concentrated.",
  },
  asset_switch_rate: {
    label: "Asset switch rate",
    definition:
      "Rate of switching between different assets from one trade to the next (0–1).",
  },

  // ---- P&L & risk ----
  pnl_std: {
    label: "P&L standard deviation",
    definition: "Standard deviation of profit/loss per trade in the window.",
  },
  pnl_mean: {
    label: "P&L mean",
    definition: "Mean profit/loss per trade in the window.",
  },
  pnl_sum: {
    label: "P&L sum",
    definition: "Total profit/loss in the window.",
  },
  pnl_skew_proxy: {
    label: "P&L skew proxy",
    definition:
      "Proxy for P&L distribution skew using 10th/90th percentiles and median.",
  },
  win_rate: {
    label: "Win rate",
    definition: "Fraction of trades with positive P&L in the window (0–1).",
  },
  payoff_ratio: {
    label: "Payoff ratio",
    definition: "Average gain per winning trade / average loss per losing trade.",
  },
  avg_gain: {
    label: "Average gain",
    definition: "Mean P&L over winning trades only.",
  },
  avg_loss_abs: {
    label: "Average loss (abs)",
    definition: "Mean absolute P&L over losing trades only.",
  },

  // ---- Sizing & turnover ----
  turnover: {
    label: "Turnover",
    definition: "Total notional traded in the window divided by starting balance.",
  },
  turnover_per_hour: {
    label: "Turnover per hour",
    definition:
      "Notional traded per hour (normalized by window length and starting balance).",
  },
  sizing_sum: {
    label: "Sizing sum",
    definition: "Sum of trade sizes (quantity × price) in the window.",
  },
  sizing_mean: {
    label: "Sizing mean",
    definition: "Mean trade size in the window.",
  },
  sizing_std: {
    label: "Sizing std",
    definition: "Standard deviation of trade sizes in the window.",
  },

  // ---- Balance / drawdown ----
  window_start_balance: {
    label: "Window start balance",
    definition: "Account balance at the start of the window.",
  },
  dd_max: {
    label: "Max drawdown",
    definition:
      "Maximum drawdown in the window: (min balance − start balance) / start balance.",
  },

  // ---- Revenge indicators (post-loss vs baseline) ----
  post_trade_rate_ratio: {
    label: "Post-loss trade rate ratio",
    definition:
      "Trade rate after the loss divided by trade rate before (baseline). >1 suggests increased activity after a loss.",
  },
  post_turnover_delta: {
    label: "Post-loss turnover ratio",
    definition: "Turnover after loss / turnover before (baseline).",
  },
  post_sizing_mean_ratio: {
    label: "Post-loss sizing ratio",
    definition: "Mean trade size after loss / mean size before (baseline).",
  },
  post_win_rate_delta: {
    label: "Post-loss win rate change",
    definition: "Win rate after loss minus win rate before (baseline).",
  },
  post_pnl_vol_ratio: {
    label: "Post-loss P&L volatility ratio",
    definition: "P&L std after loss / P&L std before (baseline).",
  },
  post_asset_switch_delta: {
    label: "Post-loss asset switch change",
    definition: "Change in asset-switch rate after the loss vs baseline.",
  },
  post_burst_frac_delta: {
    label: "Post-loss burst fraction change",
    definition: "Change in burst fraction (rapid trading) after the loss vs baseline.",
  },

  // ---- Loss-aversion indicators ----
  small_gain_frac: {
    label: "Small gain fraction",
    definition:
      "Fraction of winning trades with small gains (e.g. P&L% < 0.2%). Suggests taking profits too early.",
  },
  large_loss_frac: {
    label: "Large loss fraction",
    definition:
      "Fraction of trades with large losses (e.g. P&L% < −0.5%). Indicates holding losing positions.",
  },
  loss_tail_ratio: {
    label: "Loss tail ratio",
    definition:
      "Ratio of 90th percentile loss size to 90th percentile gain size. Higher = losses extend further than gains.",
  },
  asymmetry_index: {
    label: "Asymmetry index",
    definition:
      "Asymmetry between average loss and average gain: (|avg loss| − avg gain) / (|avg loss| + avg gain).",
  },
  gain_clipping: {
    label: "Gain clipping",
    definition:
      "Median winning trade / 95th percentile winning trade. Lower values suggest cutting winners short.",
  },

  // ---- Model probability outputs ----
  overtrading_prob: {
    label: "Overtrading probability",
    definition:
      "Model probability (0–1) that this window shows overtrading behavior. Higher = more likely overtrading.",
  },
  revenge_prob: {
    label: "Revenge trading probability",
    definition:
      "Model probability (0–1) that trading after this loss event is revenge-driven. Higher = more likely revenge trading.",
  },
  loss_aversion_prob: {
    label: "Loss aversion probability",
    definition:
      "Model probability (0–1) that this window shows loss-averse behavior (holding losers, cutting winners). Higher = more likely loss aversion.",
  },
};

export function getFeatureTooltip(col: string): { label: string; definition: string } {
  const entry = ML_FEATURE_GLOSSARY[col];
  if (entry) return entry;
  // Humanize unknown: e.g. "post_trade_rate_ratio" -> "Post trade rate ratio"
  const label = col
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return {
    label,
    definition: "Preprocessed ML feature used as model input or output.",
  };
}
