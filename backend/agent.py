"""CogniTrade AI Agent -- Backboard-powered trading psychology expert.

Public API
----------
- ``create_analysis_session(df, scores) -> dict``
  Loads trades into DuckDB, creates a Backboard thread, and generates an
  expert report.  Returns ``{thread_id, report}``.

- ``agent_chat(thread_id, message) -> str``
  Sends a follow-up message on an existing thread (with tool-call
  resolution) and returns the agent's text response.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import duckdb
import pandas as pd
from backboard import BackboardClient
from backboard.models import ToolOutput

# ---------------------------------------------------------------------------
# Configuration  (read lazily so load_dotenv() in app.py runs first)
# ---------------------------------------------------------------------------

def _get_api_key() -> str:
    key = os.getenv("BACKBOARD_API_KEY", "")
    if not key:
        raise RuntimeError(
            "BACKBOARD_API_KEY is not set. "
            "Add it to your .env file or export it as an environment variable."
        )
    return key


def _llm_kwargs() -> dict[str, str]:
    """Return provider/model overrides for Backboard ``add_message``."""
    provider = os.getenv("BACKBOARD_LLM_PROVIDER", "")
    model = os.getenv("BACKBOARD_MODEL_NAME", "")
    kw: dict[str, str] = {}
    if provider:
        kw["llm_provider"] = provider
    if model:
        kw["model_name"] = model
    return kw


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are **CogniTrade Expert**, an elite trading psychologist and quantitative \
behavioral-finance analyst.  You specialise in identifying unconscious trading \
biases -- overtrading, revenge trading, and loss aversion -- by combining \
model-derived probability scores with direct evidence from raw trade records.

## Capabilities
- Model scores for three biases (overtrading, revenge trading, loss aversion) \
are provided as context when the conversation starts.
- You can run SQL against the trader's uploaded data via the `query_trade_data` \
tool.  The table is called **trades** with columns: `timestamp`, `asset`, \
`side`, `quantity`, `entry_price`, `exit_price`, `profit_loss`, `balance`, \
`notional`.
- You can call `get_trade_summary` for high-level statistics without writing SQL.

## Initial-report structure
When generating the first analysis report, follow this outline:

1. **Executive Summary** -- One-paragraph overview of the trader's behavioral \
profile.
2. **Overtrading Analysis** -- Interpret the overtrading score.  Find the most \
active trading clusters and cite specific timestamps.
3. **Revenge Trading Analysis** -- Interpret the revenge score.  Find post-loss \
trading bursts and cite the loss event → rapid follow-up trade sequences.
4. **Loss Aversion Analysis** -- Interpret the loss-aversion score.  Identify \
holding-losers / cutting-winners patterns and cite examples.
5. **Actionable Recommendations** -- 3-5 concrete, specific steps the trader \
should take immediately.

## Guidelines
- Be **direct and evidence-based**.  Always cite specific trades, timestamps, \
or data patterns.
- **Tool use**: Call **at most 2–3 tools per response**. First call \
`get_trade_summary` once for an overview, then call `query_trade_data` at most \
once or twice with the most important SQL queries. Do not issue many tool calls \
in parallel.
- Communicate in a supportive but honest tone -- like a coach, not a critic.
- Format all responses in clean **markdown**.
- Keep the initial report concise (roughly 400-600 words).
"""

# ---------------------------------------------------------------------------
# Tool definitions (OpenAI-compatible function-calling schema)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_trade_data",
            "description": (
                "Run a read-only SQL query against the trader's uploaded "
                "trade history.  The table is called 'trades' with columns: "
                "timestamp, asset, side, quantity, entry_price, exit_price, "
                "profit_loss, balance, notional.  Returns a text table of "
                "results (max 50 rows)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "A valid read-only SQL query.",
                    }
                },
                "required": ["sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_trade_summary",
            "description": (
                "Return high-level statistics about the trader's uploaded "
                "data: total trades, date range, P&L distribution, most "
                "traded assets, balance range, and win rate."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]

# ---------------------------------------------------------------------------
# In-memory session store:  thread_id  ->  DuckDB connection
# ---------------------------------------------------------------------------

_sessions: dict[str, duckdb.DuckDBPyConnection] = {}

# Re-use a single Backboard assistant across all sessions.
_assistant_id: str | None = None

# ---------------------------------------------------------------------------
# DuckDB helpers
# ---------------------------------------------------------------------------


def _load_into_duckdb(df: pd.DataFrame) -> duckdb.DuckDBPyConnection:
    """Create an in-memory DuckDB connection with a ``trades`` table."""
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).astype(str)
    if "notional" not in df.columns:
        df["notional"] = df["quantity"] * df["entry_price"]
    conn = duckdb.connect(":memory:")
    conn.register("_trades_df", df)
    conn.execute("CREATE TABLE trades AS SELECT * FROM _trades_df")
    conn.unregister("_trades_df")
    return conn


def _get_trade_summary(conn: duckdb.DuckDBPyConnection) -> str:
    """Build a JSON summary string from the trades table."""
    stats: dict[str, Any] = {}

    row = conn.execute(
        "SELECT COUNT(*) AS n, MIN(timestamp) AS first_ts, "
        "MAX(timestamp) AS last_ts FROM trades"
    ).fetchone()
    stats["total_trades"] = row[0]
    stats["date_range"] = f"{row[1]}  to  {row[2]}"

    row = conn.execute(
        "SELECT SUM(profit_loss), AVG(profit_loss), "
        "STDDEV_SAMP(profit_loss), MEDIAN(profit_loss) FROM trades"
    ).fetchone()
    stats["total_pnl"] = round(row[0], 2) if row[0] is not None else 0
    stats["avg_pnl_per_trade"] = round(row[1], 2) if row[1] is not None else 0
    stats["pnl_stddev"] = round(row[2], 2) if row[2] is not None else 0
    stats["pnl_median"] = round(row[3], 2) if row[3] is not None else 0

    row = conn.execute(
        "SELECT ROUND(COUNT(*) FILTER (WHERE profit_loss > 0) "
        "* 100.0 / NULLIF(COUNT(*), 0), 1) FROM trades"
    ).fetchone()
    stats["win_rate_pct"] = row[0] if row[0] is not None else 0

    top_assets = conn.execute(
        "SELECT asset, COUNT(*) AS cnt FROM trades "
        "GROUP BY asset ORDER BY cnt DESC LIMIT 5"
    ).fetchdf()
    stats["top_assets"] = top_assets.to_dict(orient="records")

    row = conn.execute(
        "SELECT MIN(balance), MAX(balance) FROM trades"
    ).fetchone()
    stats["balance_min"] = round(row[0], 2) if row[0] is not None else 0
    stats["balance_max"] = round(row[1], 2) if row[1] is not None else 0

    return json.dumps(stats, indent=2, default=str)


def _tc_get(tc: Any, *keys: str, default: Any = None) -> Any:
    """Safely traverse a tool-call that may be a dict or an object."""
    obj = tc
    for k in keys:
        if isinstance(obj, dict):
            obj = obj.get(k, default)
        else:
            obj = getattr(obj, k, default)
        if obj is default:
            return default
    return obj


def _tc_id(tc: Any) -> str:
    """Get the tool-call ID regardless of dict/object shape."""
    if isinstance(tc, dict):
        return (tc.get("id") or tc.get("tool_call_id") or "").strip()
    # Pydantic model or object: try attribute then serialized form
    out = getattr(tc, "id", None) or getattr(tc, "tool_call_id", None)
    if out is not None and str(out).strip():
        return str(out).strip()
    if hasattr(tc, "model_dump"):
        d = tc.model_dump()
        return (d.get("id") or d.get("tool_call_id") or "").strip()
    if hasattr(tc, "dict"):
        d = tc.dict()
        return (d.get("id") or d.get("tool_call_id") or "").strip()
    return ""


def _tc_args(tc: Any) -> dict:
    """Get parsed arguments from a tool call (dict or object)."""
    # Object style: tc.function.parsed_arguments
    parsed = _tc_get(tc, "function", "parsed_arguments")
    if isinstance(parsed, dict):
        return parsed
    # Dict style: tc["function"]["arguments"] (JSON string)
    raw = _tc_get(tc, "function", "arguments", default="")
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def _execute_tool(
    tool_call: Any,
    db_conn: duckdb.DuckDBPyConnection,
) -> str:
    """Execute a tool call and return the result as a string."""
    name = _tc_get(tool_call, "function", "name", default="")
    args = _tc_args(tool_call)

    if name == "query_trade_data":
        sql = args.get("sql", "")
        # Safety: reject mutating statements
        first_word = sql.strip().split()[0].upper() if sql.strip() else ""
        if first_word not in ("SELECT", "WITH", "EXPLAIN"):
            return "Error: only SELECT / WITH / EXPLAIN queries are allowed."
        try:
            result_df = db_conn.execute(sql).fetchdf()
            n = len(result_df)
            if n == 0:
                return "(no rows returned)"
            if n > 50:
                return (
                    f"Query returned {n} rows (showing first 50):\n"
                    + result_df.head(50).to_string(index=False)
                )
            return result_df.to_string(index=False)
        except Exception as exc:
            return f"SQL error: {exc}"

    if name == "get_trade_summary":
        return _get_trade_summary(db_conn)

    return f"Unknown tool: {name}"


# ---------------------------------------------------------------------------
# Backboard async helpers
# ---------------------------------------------------------------------------


async def _ensure_assistant(client: BackboardClient) -> str:
    """Create the CogniTrade Expert assistant (once) and return its ID."""
    global _assistant_id
    if _assistant_id is None:
        assistant = await client.create_assistant(
            name="CogniTrade Expert",
            system_prompt=SYSTEM_PROMPT,
            tools=TOOLS,
        )
        # Handle both dict and object response shapes
        if isinstance(assistant, dict):
            _assistant_id = assistant.get("assistant_id", assistant.get("id", ""))
        else:
            _assistant_id = getattr(assistant, "assistant_id", getattr(assistant, "id", ""))
    return _assistant_id


async def _send_and_resolve(
    client: BackboardClient,
    thread_id: str,
    content: str,
    db_conn: duckdb.DuckDBPyConnection,
    *,
    max_rounds: int = 5,
) -> str:
    """Send a message, resolve any tool calls, and return the final text."""
    llm = _llm_kwargs()
    response = await client.add_message(
        thread_id=thread_id,
        content=content,
        stream=False,
        **llm,
    )

    def _resp_get(r: Any, key: str, default: Any = None) -> Any:
        if isinstance(r, dict):
            return r.get(key, default)
        return getattr(r, key, default)

    def _get_tool_calls(r: Any) -> list:
        """Tool calls can be on response or under required_action (OpenAI-style)."""
        direct = _resp_get(r, "tool_calls")
        if direct:
            return direct if isinstance(direct, list) else []
        ra = _resp_get(r, "required_action")
        if not ra:
            return []
        submit = ra.get("submit_tool_outputs", {}) if isinstance(ra, dict) else getattr(ra, "submit_tool_outputs", None)
        if submit is None:
            return []
        return submit.get("tool_calls", []) if isinstance(submit, dict) else getattr(submit, "tool_calls", []) or []

    rounds = 0
    status = _resp_get(response, "status")
    if isinstance(status, str):
        status = status.upper().replace("-", "_")
    while (
        status == "REQUIRES_ACTION"
        and rounds < max_rounds
    ):
        tool_calls = _get_tool_calls(response)
        if not tool_calls:
            break
        tool_outputs = []
        for tc in tool_calls:
            tc_id = _tc_id(tc)
            output = _execute_tool(tc, db_conn)
            out_str = str(output) if not isinstance(output, str) else output
            tool_outputs.append(ToolOutput(tool_call_id=tc_id or "unknown", output=out_str))

        run_id = _resp_get(response, "run_id", "")
        if not run_id:
            ra = _resp_get(response, "required_action")
            if isinstance(ra, dict) and ra:
                run_id = ra.get("run_id") or (ra.get("submit_tool_outputs") or {}).get("run_id") or ""
            elif hasattr(ra, "run_id"):
                run_id = getattr(ra, "run_id", "") or ""
        response = await client.submit_tool_outputs(
            thread_id=thread_id,
            run_id=run_id,
            tool_outputs=tool_outputs,
        )
        status = _resp_get(response, "status")
        if isinstance(status, str):
            status = status.upper().replace("-", "_")
        rounds += 1

    return _resp_get(response, "content") or str(response)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def _build_analysis_prompt(df: pd.DataFrame, scores: dict) -> str:
    """Build the initial message the agent sees after a CSV upload."""
    n = len(df)
    ts = pd.to_datetime(df["timestamp"], utc=True)
    date_min = ts.min()
    date_max = ts.max()
    total_pnl = df["profit_loss"].sum()
    win_rate = (df["profit_loss"] > 0).mean() * 100

    ot = scores["overtrading"]
    rv = scores["revenge"]
    la = scores["loss_aversion"]

    return (
        f"I have just uploaded my trading history ({n} trades from "
        f"{date_min} to {date_max}).\n\n"
        f"Overall P&L: ${total_pnl:,.2f} | Win rate: {win_rate:.1f}%\n\n"
        "Here are the model-derived bias scores:\n\n"
        f"- **Overtrading**: avg_score = {ot['avg_score']:.2%} "
        f"across {len(ot['windows'])} time windows\n"
        f"- **Revenge Trading**: avg_score = {rv['avg_score']:.2%} "
        f"across {len(rv['windows'])} post-loss events\n"
        f"- **Loss Aversion**: avg_score = {la['avg_score']:.2%} "
        f"across {len(la['windows'])} windows\n\n"
        "Please generate your expert analysis report. Start by calling "
        "`get_trade_summary` for an overview, then use `query_trade_data` "
        "to find specific examples that support or contradict the model "
        "scores. Follow the report structure from your instructions."
    )


# ---------------------------------------------------------------------------
# Public API  (sync wrappers around async internals)
# ---------------------------------------------------------------------------


def create_analysis_session(
    df: pd.DataFrame,
    scores: dict,
) -> dict:
    """Run the three-model scores through the LLM agent and return a report.

    Returns
    -------
    dict
        ``{"thread_id": str, "report": str}``
    """
    return asyncio.run(_create_analysis_session(df, scores))


async def _create_analysis_session(
    df: pd.DataFrame,
    scores: dict,
) -> dict:
    client = BackboardClient(api_key=_get_api_key())
    assistant_id = await _ensure_assistant(client)
    thread = await client.create_thread(assistant_id)

    # Handle both dict and object response shapes
    if isinstance(thread, dict):
        tid = thread.get("thread_id", thread.get("id", ""))
    else:
        tid = getattr(thread, "thread_id", getattr(thread, "id", ""))

    db_conn = _load_into_duckdb(df)
    _sessions[tid] = db_conn

    prompt = _build_analysis_prompt(df, scores)
    report = await _send_and_resolve(client, tid, prompt, db_conn)

    return {
        "thread_id": tid,
        "report": report,
    }


def agent_chat(thread_id: str, message: str) -> str:
    """Send a follow-up chat message and return the agent's response."""
    return asyncio.run(_agent_chat(thread_id, message))


async def _agent_chat(thread_id: str, message: str) -> str:
    if thread_id not in _sessions:
        raise ValueError(
            "Session not found. Please re-upload your trade data."
        )

    db_conn = _sessions[thread_id]
    client = BackboardClient(api_key=_get_api_key())

    return await _send_and_resolve(client, thread_id, message, db_conn)
