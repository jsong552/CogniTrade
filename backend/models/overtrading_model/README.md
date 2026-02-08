# Overtrading Model

This folder contains the preprocessing, training, and inference assets for a
window‑level overtrading classifier.

## What the model predicts
- **Label**: `is_calm` (1 = calm, 0 = overtrading)
- **Model output**: **P(is_calm = 0)** per window (probability of overtrading)

## Data flow
1. **Raw trades → window features**  
   `data_analysis/data_preprocessing.ipynb` builds window‑level features from
   trade logs (timestamp, asset, side, quantity, entry_price, exit_price,
   profit_loss, balance).
2. **Training**  
   `model_training/model_training.ipynb` trains a boosting classifier using
   the window features. `is_calm` is the label; all other numeric features are inputs.
3. **Inference**  
   `predict_overtrading.py` loads the frozen model and outputs per‑window
   overtrading scores.

## Key files
- `data_analysis/data_preprocessing.ipynb`  
  Builds `data_preprocessing_training.csv` with window‑level features and `is_calm`.
- `model_training/model_training.ipynb`  
  Trains the model and saves `overtrading_model.joblib`.
- `predict_overtrading.py`  
  Scores raw trade CSVs and outputs `overtrading_window_scores.csv`.

## Run inference
From `backend/models/overtrading_model`:

```bash
python predict_overtrading.py \
  --input "../../mock_behaviours/balanced_example.csv" \
  --model "model_training/overtrading_model.joblib" \
  --output "balanced_example_overtrading_scores.csv"
```

## Feature list (window‑level)
`window_start`, `window_end`, `n_trades`, `trade_rate_per_min`, `median_gap_sec`,
`mean_gap_sec`, `gap_cv`, `burst_frac`, `n_assets`, `top_asset_share`,
`asset_switch_rate`, `notional_sum`, `notional_mean`, `notional_std`, `turnover`,
`pnl_sum`, `pnl_mean`, `pnl_std`, `win_rate`, `avg_gain`, `avg_loss_abs`,
`payoff_ratio`, `pnl_skew_proxy`, `dd_max`, `window_start_balance`, `session_id`,
`source_file`, `is_calm`, `trade_rate_gt_p90`, `p90_trade_rate_global`,
`turnover_per_hour`, `hot_streak_len`.
