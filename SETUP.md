# CogniTrade – Frontend & Backend Setup

## Prerequisites

- **Node.js** (v18+) and **npm**
- **Python 3.10+**
- **OpenAI or Backboard API key** (for the AI agent; put in `.env`)

---

## 1. Backend (Flask, port 5001)

From the **CogniTrade** directory:

```bash
# Create and activate a virtual environment (optional but recommended)
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install Python dependencies
pip install -r backend/requirements.txt

# Environment: copy .env.example to .env and add your keys
# At minimum, set OPENAI_API_KEY or BACKBOARD_API_KEY for the AI agent.
cp .env.example .env
# Edit .env and add your API key(s).

# Run the backend (from CogniTrade directory)
cd backend && python app.py
```

The API will be at **http://localhost:5001**. Leave this terminal open.

- Health check: **http://localhost:5001/health**

---

## 2. Frontend (Vite + React, default port 5173)

In a **second terminal**, from the **CogniTrade** directory:

```bash
# Install Node dependencies
npm install

# Run the dev server
npm run dev
```

Open the URL shown (usually **http://localhost:5173**). The app talks to the backend at `http://localhost:5001` unless you set `VITE_API_URL` or `VITE_BACKEND_URL` in `.env`.

---

## 3. Quick reference

| Service   | URL                  | Command (from CogniTrade)        |
|----------|----------------------|-----------------------------------|
| Backend  | http://localhost:5001 | `cd backend && python app.py`    |
| Frontend | http://localhost:5173 | `npm run dev`                    |

**Tip:** Run backend and frontend in two separate terminals so both stay running. If you see “Could not reach the backend”, start the backend first and keep it running.

---

## 4. Optional env vars (see `.env.example`)

- **Backend:** `OPENAI_API_KEY` or `BACKBOARD_API_KEY`, `GRADIUM_API_KEY` (voice), etc.
- **Frontend:** `VITE_API_URL` or `VITE_BACKEND_URL` (default: `http://localhost:5001`), `VITE_ALPACA_*`, `VITE_FINNHUB_API_KEY`, etc.
