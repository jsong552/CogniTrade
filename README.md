# CogniTrade

<div align="center">
  <img src="public/cognitrade_logo2.png" alt="CogniTrade Logo" width="120" />
  
  **AI-Powered Trading Psychology Platform**
  
  *Identify, understand, and overcome psychological trading biases with machine learning*
  
  [![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://reactjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)
  [![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python)](https://www.python.org/)
  [![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask)](https://flask.palletsprojects.com/)
</div>

---

## 🎯 Overview

CogniTrade is a comprehensive trading psychology platform that combines **paper trading simulation** with **AI-powered behavioral analysis**. It uses machine learning models to detect common psychological biases in your trading patterns, helping you become a more disciplined and profitable trader.

### Why CogniTrade?

Most traders don't fail because of bad strategies—they fail because of psychological biases. CogniTrade helps you:

- 📊 **Track your trades** with a realistic paper trading simulation
- 🧠 **Detect psychological biases** using ML models trained on trading behavior
- 💬 **Get AI-powered insights** from an expert trading coach
- 📈 **Improve your discipline** with educational content and quizzes

---

## ✨ Features

### 📊 Paper Trading Simulator

Full-featured paper trading with **real market data** powered by the Alpaca Markets API:

- **Market & Limit Orders** — Execute buy/sell orders with market or limit pricing
- **Stop-Loss & Take-Profit** — Set automatic exit levels for risk management
- **Watchlist Management** — Track your favorite stocks with live price updates
- **Position Tracking** — Monitor P&L, average cost basis, and portfolio allocation
- **Order History** — Complete log of all trades with timestamps and notes
- **Voice Memos** — Record voice notes for trades using speech-to-text (Gradium API)
- **Interactive Charts** — Real-time candlestick charts with multiple timeframes
- **Persistent Data** — All data saved to localStorage for consistency across sessions

### 🧠 AI Behavioral Analysis

Upload your trade logs (or use your in-app trades) for comprehensive psychological analysis:

#### Machine Learning Models

| Model | Detection Target | Algorithm |
|-------|-----------------|-----------|
| **Overtrading Detector** | Excessive trading frequency | XGBoost Classifier |
| **Revenge Trading Detector** | Post-loss aggressive trading | Custom ML Pipeline |
| **Loss Aversion Detector** | Holding losers / cutting winners | Pattern Analysis |
| **Journal Bias Detector** | NLP analysis of trade journals | RoBERTa Multi-Label |

#### Five Psychological Biases Tracked

1. **FOMO** — Chasing trades out of fear of missing out
2. **Loss Aversion** — Cutting winners early, holding losers too long
3. **Revenge Trading** — Trading emotionally after losses to "win it back"
4. **Overtrading** — Taking excessive low-quality trades
5. **Gambler's Fallacy** — Believing in false patterns and "due" wins

### 🤖 AI Trading Coach (Expert Agent)

An intelligent assistant powered by **LangGraph + Backboard AI** that:

- Analyzes your complete trading history with SQL queries
- Provides personalized feedback on your trading patterns
- Answers follow-up questions about specific trades
- Offers actionable advice for improving discipline
- Streams responses with real-time progress updates

### 📚 Educational Content

- **Behavior Summary** — Quick-reference guide to the five trading biases
- **Pre-Trade Checklist** — Questions to ask before every trade
- **Interactive Quiz** — Test your bias recognition with real training examples
- **Daily Intentions** — Mindset prompts for disciplined trading

---

## 🏗️ Architecture

```
CogniTrade/
├── src/                     # React Frontend (Vite + TypeScript)
│   ├── pages/               # Route pages
│   │   ├── Index.tsx        # Dashboard with portfolio overview
│   │   ├── TradePage.tsx    # Trading interface with charts
│   │   ├── SearchPage.tsx   # Stock search and watchlist
│   │   ├── AnalysisPage.tsx # ML bias analysis + AI chat
│   │   ├── SummaryPage.tsx  # Educational content + quiz
│   │   ├── SettingsPage.tsx # Account settings
│   │   └── LogsPage.tsx     # Trade history logs
│   ├── components/          # Reusable UI components
│   │   ├── AlpacaMarketChart.tsx  # Interactive stock charts
│   │   ├── TradePanel.tsx         # Buy/sell order form
│   │   ├── AgentChat.tsx          # AI expert chat interface
│   │   ├── LogUpload.tsx          # Trade log upload + analysis
│   │   ├── BehaviorAnalysis.tsx   # Bias score cards
│   │   └── ui/                    # Radix UI primitives
│   └── lib/
│       └── tradingStore.ts  # Zustand state management
│
├── backend/                 # Python Flask Backend
│   ├── app.py               # Flask API routes
│   ├── agent.py             # LangGraph AI agent with DuckDB
│   ├── models/              # ML model inference
│   │   ├── overtrading_model/
│   │   ├── revenge_trading_model/
│   │   └── loss_aversion_trading_model/
│   ├── journal_model_training_script/
│   │   └── train_bias_detector.py  # RoBERTa training
│   └── requirements.txt
│
└── public/
    └── cognitrade_logo2.png
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **API Keys** (see below)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/CogniTrade.git
cd CogniTrade
```

### 2. Configure Environment Variables

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Alpaca Markets (for real-time stock data)
VITE_ALPACA_API_KEY=your_alpaca_key
VITE_ALPACA_SECRET_KEY=your_alpaca_secret
VITE_ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Backend API URL (default for local dev)
VITE_API_URL=http://localhost:5001

# Gradium (for voice transcription)
GRADIUM_API_KEY=your_gradium_key
GRADIUM_REGION=us

# Backboard AI (for the AI trading expert)
BACKBOARD_API_KEY=your_backboard_key

# OpenAI (backup for AI features)
OPENAI_API_KEY=your_openai_key
```

### 3. Install Frontend Dependencies

```bash
npm install
```

### 4. Install Backend Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 5. Start the Development Servers

**Terminal 1 — Frontend:**
```bash
npm run dev
```

**Terminal 2 — Backend:**
```bash
cd backend
source venv/bin/activate
python app.py
```

The app will be available at **http://localhost:5173** or **http://localhost:8080**

---

## 📡 API Endpoints

### Backend API (Flask)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/health` | GET | Service status |
| `/transcribe` | POST | Single-shot audio transcription |
| `/transcribe/stream` | WebSocket | Real-time streaming transcription |
| `/analyze_journal` | POST | Analyze journal text for biases (RoBERTa) |
| `/analyze_trades` | POST | Analyze trade CSV for all three biases |
| `/agent/analyze` | POST | Full AI analysis with ML + expert report (SSE) |
| `/agent/chat` | POST | Follow-up chat with the AI expert (SSE) |

### CSV Upload Format

For the `/analyze_trades` and `/agent/analyze` endpoints, upload a CSV with these columns:

| Column | Type | Description |
|--------|------|-------------|
| `timestamp` | datetime | Trade execution time |
| `asset` | string | Stock symbol (e.g., AAPL) |
| `side` | string | "buy" or "sell" |
| `quantity` | number | Number of shares |
| `entry_price` | number | Entry price per share |
| `exit_price` | number | Exit price per share |
| `profit_loss` | number | P&L for the trade |
| `balance` | number | Account balance after trade |

---

## 🔧 Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool & dev server |
| **TailwindCSS** | Utility-first styling |
| **Radix UI** | Accessible component primitives |
| **Zustand** | State management |
| **Motion** | Animations |
| **Recharts** | Data visualization |
| **Lightweight Charts** | Stock candlestick charts |
| **React Query** | Server state management |

### Backend

| Technology | Purpose |
|------------|---------|
| **Flask** | Web framework |
| **Flask-CORS** | Cross-origin requests |
| **Flask-Sock** | WebSocket support |
| **Pandas** | Data manipulation |
| **scikit-learn** | ML utilities |
| **XGBoost** | Overtrading model |
| **PyTorch** | Deep learning runtime |
| **Transformers** | RoBERTa bias detector |
| **LangGraph** | AI agent orchestration |
| **Backboard SDK** | AI thread management |
| **DuckDB** | In-memory SQL for trade analysis |

---

## 🧪 Model Training

### Overtrading Model

The overtrading detector uses XGBoost trained on windowed trading features:
- Trade frequency per window
- Average position size deviation
- Time between trades
- Win/loss streaks

### Journal Bias Detector

The RoBERTa-based NLP model is trained on labeled trading journal entries:

```bash
cd backend/journal_model_training_script
python train_bias_detector.py
```

Training data is in `backend/rational_training/train.json`.

---

## 📸 Screenshots

| Dashboard | Trading | Analysis |
|-----------|---------|----------|
| Portfolio overview with P&L | Real-time charts + order form | ML bias scores + AI chat |

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Alpaca Markets](https://alpaca.markets/) for real-time market data
- [Backboard AI](https://backboard.ai/) for AI agent infrastructure
- [Gradium](https://gradium.ai/) for speech-to-text
- [Radix UI](https://www.radix-ui.com/) for accessible components
- [TradingView Lightweight Charts](https://github.com/nicholastu2/lightweight-charts) for stock charts

---

<div align="center">
  <strong>Trade smarter, not harder.</strong>
  <br><br>
  Made with ❤️ for disciplined traders everywhere.
</div>

## GRADIUM PITCH


https://github.com/user-attachments/assets/d8af92d0-2e74-49b3-87c9-53291b091282


