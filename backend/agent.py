"""
CogniTrade AI Agent -- Backboard-powered trading psychology expert (LangGraph orchestration).

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
import logging
import os
from contextvars import ContextVar
from typing import Any, Callable, Optional, cast

import duckdb
import pandas as pd
from backboard import BackboardClient
from backboard.models import ToolOutput
from typing_extensions import TypedDict

from langgraph.graph import END, StateGraph

logger = logging.getLogger(__name__)

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
# Coded thresholds (enforced by orchestration, not by prompting)
# ---------------------------------------------------------------------------

# One tool call per cycle: simpler and less error-prone (model is instructed to call one at a time).
MAX_TOOL_CALLS_PER_CYCLE = int(os.getenv("COGNITRADE_MAX_TOOL_CALLS_PER_CYCLE", "1"))
MAX_TOOL_CYCLES = int(os.getenv("COGNITRADE_MAX_TOOL_CYCLES", "6"))
SQL_MAX_ROWS = int(os.getenv("COGNITRADE_SQL_MAX_ROWS", "50"))
HISTORY_MAX_ITEMS = int(os.getenv("COGNITRADE_HISTORY_MAX_ITEMS", "500"))

# Retry settings for transient Backboard API failures (e.g. REQUEST_TIME_OUT / Request timed out)
BACKBOARD_MAX_RETRIES = int(os.getenv("COGNITRADE_BACKBOARD_MAX_RETRIES", "5"))
BACKBOARD_RETRY_BASE_DELAY = float(os.getenv("COGNITRADE_BACKBOARD_RETRY_BASE_DELAY", "4.0"))
# Per-request timeout so we never hang indefinitely on add_message / submit_tool_outputs
BACKBOARD_REQUEST_TIMEOUT = float(os.getenv("COGNITRADE_BACKBOARD_REQUEST_TIMEOUT", "120.0"))


async def _backboard_retry(coro_factory, *, max_retries: int = BACKBOARD_MAX_RETRIES):
    """Call an async Backboard function with a per-request timeout and exponential-backoff retry.

    Each attempt is capped at BACKBOARD_REQUEST_TIMEOUT seconds so we never hang indefinitely
    (e.g. at add_message). Timeout and other transient errors trigger a retry.

    ``coro_factory`` must be a **zero-argument callable** that returns a new
    awaitable each time (because a coroutine object can only be awaited once).
    """
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await asyncio.wait_for(
                coro_factory(),
                timeout=BACKBOARD_REQUEST_TIMEOUT,
            )
        except asyncio.TimeoutError as exc:
            # Treat our own timeout as transient so we retry
            last_exc = exc
            if attempt >= max_retries:
                raise RuntimeError(
                    f"Backboard request timed out after {max_retries + 1} attempts "
                    f"(each attempt capped at {BACKBOARD_REQUEST_TIMEOUT}s)."
                ) from exc
            delay = BACKBOARD_RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "Backboard request timeout (attempt %d/%d) — retrying in %.1fs",
                attempt + 1, max_retries + 1, delay,
            )
            await asyncio.sleep(delay)
        except Exception as exc:
            exc_str = str(exc).upper()
            is_transient = any(
                kw in exc_str
                for kw in (
                    "TIMEOUT", "TIME_OUT", "TIMED_OUT", "REQUEST TIME",
                    "REQUEST_TIMED_OUT", "502", "503", "504",
                    "RATE_LIMIT", "RATE LIMIT", "OVERLOADED", "UNAVAILABLE",
                )
            )
            if not is_transient or attempt >= max_retries:
                raise
            last_exc = exc
            delay = BACKBOARD_RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "Backboard transient error (attempt %d/%d): %s — retrying in %.1fs",
                attempt + 1, max_retries + 1, exc, delay,
            )
            await asyncio.sleep(delay)
    # Should never reach here, but just in case:
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Progress streaming (used by create_analysis_session_streaming)
# ---------------------------------------------------------------------------

_progress_callbacks: dict[str, Callable[[dict], None]] = {}
_active_thread_id: ContextVar[str] = ContextVar("_active_thread_id", default="")


def _emit_progress(thread_id: str, event: dict) -> None:
    """Send a progress event if a callback is registered for this thread."""
    cb = _progress_callbacks.get(thread_id)
    if cb:
        try:
            cb(event)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# System prompt (no procedural orchestration instructions)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are **CogniTrade Expert**, an elite trading psychologist and quantitative \
behavioral-finance analyst. You specialise in identifying unconscious trading \
biases (overtrading, revenge trading, and loss aversion) by combining \
model-derived probability scores with direct evidence from raw trade records.

## Capabilities
- Model scores for three biases (overtrading, revenge trading, loss aversion) \
are provided as context when the conversation starts.
- You can run SQL against the trader's data via the `query_trade_data` tool. \
**Tables:** (1) **trades** — raw trade history: `timestamp`, `asset`, `side`, \
`quantity`, `entry_price`, `exit_price`, `profit_loss`, `balance`, `notional`. \
(2) **overtrading_features**, **revenge_features**, **loss_aversion_features** — \
ML preprocessed features and probability columns (e.g. `overtrading_prob`, \
`revenge_prob`, `loss_aversion_prob`). Use these to find high-risk windows or \
correlate with trade outcomes.
- You can call `get_trade_summary` for high-level statistics on **trades**.

## Initial-report structure
When generating the first analysis report, follow this outline:

1. **Executive Summary** -- One-paragraph overview of the trader's behavioral profile.
2. **Overtrading Analysis** -- Interpret the overtrading score. Find the most active trading clusters and cite timestamps.
3. **Revenge Trading Analysis** -- Interpret the revenge score. Find post-loss trading bursts and cite the loss event → follow-up sequences.
4. **Loss Aversion Analysis** -- Interpret the loss-aversion score. Identify holding-losers / cutting-winners patterns and cite examples.
5. **Actionable Recommendations** -- 3-5 concrete, specific steps the trader should take immediately.

## Guidelines
- Be direct and evidence-based. Cite specific trades, timestamps, or data patterns.
- Communicate in a supportive but honest tone -- like a coach, not a critic.
- Format all responses in clean markdown.
- Keep the initial report concise (roughly 400-600 words).
- **Tool use: call at most one tool per message.** After you receive the result, you may send another message with one more tool call if needed. This keeps each step simple and avoids errors.
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
                "Run a read-only SQL query against the trader's data. Tables: "
                "'trades' (timestamp, asset, side, quantity, entry_price, exit_price, "
                "profit_loss, balance, notional); 'overtrading_features', "
                "'revenge_features', 'loss_aversion_features' (ML feature rows with "
                "probability columns e.g. overtrading_prob, revenge_prob, loss_aversion_prob). "
                "Returns a text table of results (max 50 rows)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "A valid read-only SQL query."}
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
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# ---------------------------------------------------------------------------
# Session store: thread_id -> db + histories
# ---------------------------------------------------------------------------


class InvestigationItem(TypedDict):
    Task: str
    Action: str
    Rationale: str
    Observation: str


class Session(TypedDict):
    db_conn: duckdb.DuckDBPyConnection
    user_message_history: list[str]
    investigation_history: list[InvestigationItem]


_sessions: dict[str, Session] = {}

# Re-use a single Backboard assistant across all sessions.
_assistant_id: str | None = None

# Persistent session store (survives server restart; chat works after reload).
SESSION_STORE_DIR = os.getenv(
    "COGNITRADE_SESSION_STORE_DIR",
    os.path.join(os.path.dirname(__file__), ".session_store"),
)


def _session_dir(tid: str) -> str:
    """Safe directory name for this thread_id (accepts UUID or str)."""
    safe = (str(tid) if tid else "unknown").replace("/", "_").replace("\\", "_")[:128]
    return os.path.join(SESSION_STORE_DIR, safe)


def _persist_session(
    tid: str,
    session: Session,
    df: pd.DataFrame | None = None,
    scores: dict | None = None,
) -> None:
    """Save session state to disk (trades CSV, optional ML feature CSVs, meta.json)."""
    try:
        d = _session_dir(tid)
        os.makedirs(d, exist_ok=True)
        if df is not None:
            df.to_csv(os.path.join(d, "trades.csv"), index=False)
        meta = {
            "user_message_history": session["user_message_history"],
            "investigation_history": session["investigation_history"],
        }
        if scores:
            for name in ("overtrading", "revenge", "loss_aversion"):
                model = scores.get(name)
                if not model or not isinstance(model, dict):
                    continue
                fd = model.get("feature_data")
                fc = model.get("feature_columns")
                if not fd or not fc:
                    continue
                try:
                    rows = [[row.get(c) for c in fc] for row in fd]
                    ml_df = pd.DataFrame(rows, columns=fc)
                    ml_df.to_csv(os.path.join(d, f"{name}_features.csv"), index=False)
                    meta[f"{name}_feature_columns"] = fc
                except Exception as e:
                    logger.warning("Could not persist %s features: %s", name, e)
        with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, default=str)
    except Exception as e:
        logger.warning("Could not persist session %s: %s", str(tid)[:16], e)


def _load_session_from_disk(tid: str) -> Session | None:
    """Load session from disk if it exists. Recreates db_conn from saved trades and ML feature CSVs."""
    try:
        d = _session_dir(tid)
        meta_path = os.path.join(d, "meta.json")
        csv_path = os.path.join(d, "trades.csv")
        if not os.path.isfile(meta_path) or not os.path.isfile(csv_path):
            return None
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        df = pd.read_csv(csv_path)
        scores: dict | None = None
        for name in ("overtrading", "revenge", "loss_aversion"):
            ml_path = os.path.join(d, f"{name}_features.csv")
            fc = meta.get(f"{name}_feature_columns")
            if os.path.isfile(ml_path) and fc:
                try:
                    ml_df = pd.read_csv(ml_path)
                    fd = ml_df.to_dict(orient="records")
                    if scores is None:
                        scores = {}
                    scores[name] = {"feature_data": fd, "feature_columns": list(ml_df.columns)}
                except Exception as e:
                    logger.warning("Could not load %s features: %s", name, e)
        db_conn = _load_into_duckdb(df, scores=scores)
        return {
            "db_conn": db_conn,
            "user_message_history": meta.get("user_message_history", []),
            "investigation_history": meta.get("investigation_history", []),
        }
    except Exception as e:
        logger.warning("Could not load session %s from disk: %s", str(tid)[:16], e)
        return None


# ---------------------------------------------------------------------------
# DuckDB helpers
# ---------------------------------------------------------------------------


def _load_into_duckdb(
    df: pd.DataFrame,
    scores: dict | None = None,
) -> duckdb.DuckDBPyConnection:
    """Create an in-memory DuckDB connection with a ``trades`` table and optional ML feature tables."""
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).astype(str)
    if "notional" not in df.columns:
        df["notional"] = df["quantity"] * df["entry_price"]
    conn = duckdb.connect(":memory:")
    conn.register("_trades_df", df)
    conn.execute("CREATE TABLE trades AS SELECT * FROM _trades_df")
    conn.unregister("_trades_df")

    if scores:
        for name in ("overtrading", "revenge", "loss_aversion"):
            model = scores.get(name)
            if not model or not isinstance(model, dict):
                continue
            fd = model.get("feature_data")
            fc = model.get("feature_columns")
            if not fd or not fc:
                continue
            try:
                rows = [[row.get(c) for c in fc] for row in fd]
                ml_df = pd.DataFrame(rows, columns=fc)
            except Exception as e:
                logger.warning("Skipping ML table %s: %s", name, e)
                continue
            table_name = f"{name}_features"
            conn.register("_ml_df", ml_df)
            conn.execute(f'CREATE TABLE "{table_name}" AS SELECT * FROM _ml_df')
            conn.unregister("_ml_df")

    return conn


def _get_trade_summary(conn: duckdb.DuckDBPyConnection) -> str:
    """Build a JSON summary string from the trades table."""
    stats: dict[str, Any] = {}

    row = conn.execute(
        "SELECT COUNT(*) AS n, MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts FROM trades"
    ).fetchone()
    stats["total_trades"] = row[0]
    stats["date_range"] = f"{row[1]}  to  {row[2]}"

    row = conn.execute(
        "SELECT SUM(profit_loss), AVG(profit_loss), STDDEV_SAMP(profit_loss), MEDIAN(profit_loss) FROM trades"
    ).fetchone()
    stats["total_pnl"] = round(row[0], 2) if row[0] is not None else 0
    stats["avg_pnl_per_trade"] = round(row[1], 2) if row[1] is not None else 0
    stats["pnl_stddev"] = round(row[2], 2) if row[2] is not None else 0
    stats["pnl_median"] = round(row[3], 2) if row[3] is not None else 0

    row = conn.execute(
        "SELECT ROUND(COUNT(*) FILTER (WHERE profit_loss > 0) * 100.0 / NULLIF(COUNT(*), 0), 1) FROM trades"
    ).fetchone()
    stats["win_rate_pct"] = row[0] if row[0] is not None else 0

    top_assets = conn.execute(
        "SELECT asset, COUNT(*) AS cnt FROM trades GROUP BY asset ORDER BY cnt DESC LIMIT 5"
    ).fetchdf()
    stats["top_assets"] = top_assets.to_dict(orient="records")

    row = conn.execute("SELECT MIN(balance), MAX(balance) FROM trades").fetchone()
    stats["balance_min"] = round(row[0], 2) if row[0] is not None else 0
    stats["balance_max"] = round(row[1], 2) if row[1] is not None else 0

    return json.dumps(stats, indent=2, default=str)


# ---------------------------------------------------------------------------
# Tool-call parsing + execution (dict/object tolerant)
# ---------------------------------------------------------------------------


def _tc_get(tc: Any, *keys: str, default: Any = None) -> Any:
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
    if isinstance(tc, dict):
        return (tc.get("id") or tc.get("tool_call_id") or "").strip()
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
    parsed = _tc_get(tc, "function", "parsed_arguments")
    if isinstance(parsed, dict):
        return parsed
    raw = _tc_get(tc, "function", "arguments", default="")
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def _execute_tool(tool_call: Any, db_conn: duckdb.DuckDBPyConnection) -> str:
    name = _tc_get(tool_call, "function", "name", default="")
    args = _tc_args(tool_call)

    if name == "query_trade_data":
        sql = (args.get("sql") or "").strip()
        first_word = sql.split()[0].upper() if sql else ""
        if first_word not in ("SELECT", "WITH", "EXPLAIN"):
            return "Error: only SELECT / WITH / EXPLAIN queries are allowed."
        try:
            result_df = db_conn.execute(sql).fetchdf()
            n = len(result_df)
            if n == 0:
                return "(no rows returned)"
            if n > SQL_MAX_ROWS:
                return (
                    f"Query returned {n} rows (showing first {SQL_MAX_ROWS}):\n"
                    + result_df.head(SQL_MAX_ROWS).to_string(index=False)
                )
            return result_df.to_string(index=False)
        except Exception as exc:
            return f"SQL error: {exc}"

    if name == "get_trade_summary":
        return _get_trade_summary(db_conn)

    return f"Unknown tool: {name}"


# ---------------------------------------------------------------------------
# Backboard helpers
# ---------------------------------------------------------------------------


async def _ensure_assistant(client: BackboardClient) -> str:
    global _assistant_id
    if _assistant_id is None:
        assistant = await client.create_assistant(
            name="CogniTrade Expert",
            system_prompt=SYSTEM_PROMPT,
            tools=TOOLS,
        )
        if isinstance(assistant, dict):
            _assistant_id = assistant.get("assistant_id", assistant.get("id", ""))
        else:
            _assistant_id = getattr(assistant, "assistant_id", getattr(assistant, "id", ""))
        _assistant_id = str(_assistant_id) if _assistant_id else ""
    return _assistant_id


def _resp_get(r: Any, key: str, default: Any = None) -> Any:
    if isinstance(r, dict):
        return r.get(key, default)
    return getattr(r, key, default)


def _normalize_status(status: Any) -> str:
    if not status:
        return ""
    if isinstance(status, str):
        return status.upper().replace("-", "_")
    return str(status).upper().replace("-", "_")


def _extract_run_id(resp: Any) -> str:
    run_id = _resp_get(resp, "run_id", "") or ""
    if run_id:
        return str(run_id)

    ra = _resp_get(resp, "required_action")
    if not ra:
        return ""

    if isinstance(ra, dict):
        if ra.get("run_id"):
            return str(ra["run_id"])
        submit = ra.get("submit_tool_outputs") or {}
        if isinstance(submit, dict) and submit.get("run_id"):
            return str(submit["run_id"])
        return ""

    rid = getattr(ra, "run_id", "") or ""
    if rid:
        return str(rid)
    submit = getattr(ra, "submit_tool_outputs", None)
    rid2 = getattr(submit, "run_id", "") if submit else ""
    return str(rid2) if rid2 else ""


def _extract_tool_calls(resp: Any) -> list[Any]:
    direct = _resp_get(resp, "tool_calls")
    if direct and isinstance(direct, list):
        return direct

    ra = _resp_get(resp, "required_action")
    if not ra:
        return []

    if isinstance(ra, dict):
        submit = ra.get("submit_tool_outputs") or {}
        if isinstance(submit, dict):
            tc = submit.get("tool_calls") or []
            return tc if isinstance(tc, list) else []
        return []

    submit = getattr(ra, "submit_tool_outputs", None)
    tc = getattr(submit, "tool_calls", []) if submit else []
    return tc if isinstance(tc, list) else []


def _extract_content(resp: Any) -> str:
    content = _resp_get(resp, "content")
    if content is None:
        return str(resp)
    if isinstance(content, str):
        return content
    try:
        return json.dumps(content, default=str, ensure_ascii=False)
    except Exception:
        return str(content)


# ---------------------------------------------------------------------------
# History helpers (Task / Action / Rationale / Observation)
# ---------------------------------------------------------------------------


def _push_history(
    investigation_history: list[InvestigationItem],
    *,
    task: str,
    action: str,
    rationale: str,
    observation: str,
) -> None:
    investigation_history.append(
        {
            "Task": task,
            "Action": action,
            "Rationale": rationale,
            "Observation": observation,
        }
    )
    # Emit progress event if a streaming callback is active
    tid = _active_thread_id.get("")
    if tid:
        _emit_progress(tid, {
            "type": "agent_event",
            "action": action,
            "rationale": rationale,
            "observation": observation[:200] if observation else "",
        })
    # Prevent unbounded growth in long-running threads
    if len(investigation_history) > HISTORY_MAX_ITEMS:
        del investigation_history[: len(investigation_history) - HISTORY_MAX_ITEMS]


def _short(s: str, limit: int = 800) -> str:
    s = s.strip()
    if len(s) <= limit:
        return s
    return s[:limit] + " …(truncated)"


# ---------------------------------------------------------------------------
# LangGraph orchestration (single looped agent node)
# ---------------------------------------------------------------------------


class AgentState(TypedDict, total=False):
    # Dependencies
    client: BackboardClient
    thread_id: str
    db_conn: duckdb.DuckDBPyConnection

    # New: histories tracked *in state*
    user_message_history: list[str]
    investigation_history: list[InvestigationItem]

    # Input for this invocation
    user_message: str
    task_name: str  # e.g. "Initial analysis report" / "Follow-up chat"

    # Progress
    status: str
    run_id: str
    tool_calls: list[Any]
    cycles: int
    last_response: Any

    # Output
    final_text: str
    error: str


async def _agent_node(state: AgentState) -> AgentState:
    client = state["client"]
    thread_id = state["thread_id"]
    db_conn = state["db_conn"]
    task_name = state.get("task_name") or "Trading psychology analysis"
    inv = state["investigation_history"]
    umh = state["user_message_history"]

    status = _normalize_status(state.get("status"))
    llm = _llm_kwargs()

    # 1) First pass: send the user's message
    if not status:
        msg = state["user_message"]
        umh.append(msg)

        _push_history(
            inv,
            task=task_name,
            action="BackboardClient.add_message",
            rationale="Send the user message to the Backboard thread and let the model decide whether tools are needed.",
            observation=_short(f"Sent message ({len(msg)} chars)."),
        )

        resp = await _backboard_retry(
            lambda: client.add_message(
                thread_id=thread_id,
                content=msg,
                stream=False,
                **llm,
            )
        )

        new_status = _normalize_status(_resp_get(resp, "status"))
        run_id = _extract_run_id(resp) or ""
        tool_calls = _extract_tool_calls(resp) if new_status == "REQUIRES_ACTION" else []

        _push_history(
            inv,
            task=task_name,
            action="Backboard response received",
            rationale="Capture model status and any requested tool calls to drive the next loop iteration.",
            observation=_short(
                f"status={new_status or '(none)'}; run_id={run_id or '(none)'}; tool_calls={len(tool_calls)}"
            ),
        )

        state["last_response"] = resp
        state["status"] = new_status
        state["run_id"] = run_id
        state["tool_calls"] = tool_calls
        if new_status != "REQUIRES_ACTION":
            state["final_text"] = _extract_content(resp)
        return state

    # 2) Tool resolution pass (one cycle per node execution)
    if status == "REQUIRES_ACTION":
        tool_calls = state.get("tool_calls") or _extract_tool_calls(state.get("last_response"))
        if not tool_calls:
            state["error"] = "Backboard returned REQUIRES_ACTION but no tool calls were found."
            state["status"] = "FAILED"
            state["final_text"] = _extract_content(state.get("last_response"))
            _push_history(
                inv,
                task=task_name,
                action="Error",
                rationale="Cannot resolve tool calls without tool_call objects.",
                observation=state["error"],
            )
            return state

        # API requires a response for every tool_call_id; execute all requested tool calls this cycle.
        limited_calls = tool_calls[:MAX_TOOL_CALLS_PER_CYCLE]
        if len(tool_calls) > MAX_TOOL_CALLS_PER_CYCLE:
            _push_history(
                inv,
                task=task_name,
                action="Tool-call cap enforced",
                rationale="Execute up to MAX_TOOL_CALLS_PER_CYCLE per cycle; excess are deferred.",
                observation=f"Requested {len(tool_calls)} tool calls; executing first {MAX_TOOL_CALLS_PER_CYCLE}.",
            )

        tool_outputs: list[ToolOutput] = []
        for tc in limited_calls:
            name = _tc_get(tc, "function", "name", default="(unknown)")
            args = _tc_args(tc)
            tcid = _tc_id(tc)
            if not tcid:
                _push_history(
                    inv,
                    task=task_name,
                    action="Skip tool call (missing id)",
                    rationale="Cannot submit tool output without a valid tool_call_id.",
                    observation="Skipped one tool call.",
                )
                continue

            _push_history(
                inv,
                task=task_name,
                action=f"Execute tool: {name}",
                rationale="Model requested this tool call; executing to obtain evidence from the trade dataset.",
                observation=_short(f"tool_call_id={tcid}; args={json.dumps(args, ensure_ascii=False, default=str)}"),
            )

            out = _execute_tool(tc, db_conn)

            _push_history(
                inv,
                task=task_name,
                action=f"Tool result: {name}",
                rationale="Record the observation so the investigation trace is auditable.",
                observation=_short(str(out)),
            )

            tool_outputs.append(ToolOutput(tool_call_id=tcid, output=str(out)))

        # If we capped and skipped some, we must still respond to every tool_call_id or the API errors.
        # So we only submit when we have an output for every tool call (no partial submit).
        if len(tool_outputs) < len(tool_calls):
            # Cannot submit partial list; add placeholder for each missing id so the API accepts.
            for skipped_tc in tool_calls[len(tool_outputs):]:
                skipped_id = _tc_id(skipped_tc)
                if skipped_id:
                    tool_outputs.append(
                        ToolOutput(
                            tool_call_id=skipped_id,
                            output=(
                                f"[Cap reached: only first {MAX_TOOL_CALLS_PER_CYCLE} tool calls executed this cycle.] "
                                f"Use get_trade_summary or query_trade_data in a follow-up if needed."
                            ),
                        )
                    )

        run_id = state.get("run_id") or _extract_run_id(state.get("last_response"))
        if not run_id:
            state["error"] = "Missing run_id for submit_tool_outputs."
            state["status"] = "FAILED"
            state["final_text"] = _extract_content(state.get("last_response"))
            _push_history(
                inv,
                task=task_name,
                action="Error",
                rationale="Backboard requires a run_id to accept tool outputs.",
                observation=state["error"],
            )
            return state

        _push_history(
            inv,
            task=task_name,
            action="BackboardClient.submit_tool_outputs",
            rationale="Return tool observations to the model so it can continue reasoning and produce the final response.",
            observation=_short(f"Submitting {len(tool_outputs)} tool outputs; run_id={run_id}."),
        )

        resp = await _backboard_retry(
            lambda: client.submit_tool_outputs(
                thread_id=thread_id,
                run_id=run_id,
                tool_outputs=tool_outputs,
            )
        )
        state["cycles"] = int(state.get("cycles", 0)) + 1

        new_status = _normalize_status(_resp_get(resp, "status"))
        state["last_response"] = resp
        state["status"] = new_status
        state["run_id"] = _extract_run_id(resp) or state.get("run_id", "")
        state["tool_calls"] = _extract_tool_calls(resp) if new_status == "REQUIRES_ACTION" else []

        _push_history(
            inv,
            task=task_name,
            action="Backboard response received (post-tools)",
            rationale="Decide whether another tool-resolution loop is required.",
            observation=_short(
                f"cycle={state['cycles']}; status={new_status or '(none)'}; tool_calls={len(state.get('tool_calls', []))}"
            ),
        )

        if new_status != "REQUIRES_ACTION":
            state["final_text"] = _extract_content(resp)
        return state

    # 3) Terminal pass
    state["final_text"] = _extract_content(state.get("last_response"))
    return state


def _should_continue(state: AgentState) -> str:
    status = _normalize_status(state.get("status"))
    cycles = int(state.get("cycles", 0))
    if status == "REQUIRES_ACTION" and cycles < MAX_TOOL_CYCLES:
        return "continue"
    return "end"


def _build_graph():
    g = StateGraph(AgentState)
    g.add_node("agent", _agent_node)
    g.set_entry_point("agent")
    g.add_conditional_edges("agent", _should_continue, {"continue": "agent", "end": END})
    return g.compile()


_GRAPH = _build_graph()


async def _send_and_resolve_langgraph(
    client: BackboardClient,
    thread_id: str,
    content: str,
    session: Session,
    *,
    task_name: str,
) -> str:
    init: AgentState = {
        "client": client,
        "thread_id": thread_id,
        "db_conn": session["db_conn"],
        "user_message_history": session["user_message_history"],
        "investigation_history": session["investigation_history"],
        "user_message": content,
        "task_name": task_name,
        "cycles": 0,
        "status": "",
        "run_id": "",
        "tool_calls": [],
    }
    out = await _GRAPH.ainvoke(init)

    # State lists are the session lists, so they are already updated.
    status = _normalize_status(out.get("status"))
    if status == "REQUIRES_ACTION" and int(out.get("cycles", 0)) >= MAX_TOOL_CYCLES:
        partial = out.get("final_text") or _extract_content(out.get("last_response"))
        _push_history(
            session["investigation_history"],
            task=task_name,
            action="Cycle cap reached",
            rationale="Prevent infinite loops / runaway tool usage.",
            observation=f"Stopped after {MAX_TOOL_CYCLES} cycles with status=REQUIRES_ACTION.",
        )
        return (
            f"{partial}\n\n---\n"
            f"**Note:** Tool-resolution stopped after hitting the coded cap of {MAX_TOOL_CYCLES} cycles."
        )

    if out.get("error"):
        partial = out.get("final_text") or _extract_content(out.get("last_response"))
        return f"{partial}\n\n---\n**Error:** {out['error']}"

    return out.get("final_text") or _extract_content(out.get("last_response"))


# ---------------------------------------------------------------------------
# Prompt builder (no procedural tool instructions)
# ---------------------------------------------------------------------------


def _build_analysis_prompt(df: pd.DataFrame, scores: dict, trade_summary_json: str) -> str:
    """Build a compact initial prompt so the first Backboard add_message stays under timeout."""
    n = len(df)
    ts = pd.to_datetime(df["timestamp"], utc=True)
    date_min = ts.min()
    date_max = ts.max()
    total_pnl = df["profit_loss"].sum()
    win_rate = (df["profit_loss"] > 0).mean() * 100

    ot = scores["overtrading"]
    rv = scores["revenge"]
    la = scores["loss_aversion"]

    # Keep summary short so the first LLM round is fast; model can use get_trade_summary/query_trade_data for detail
    summary_cap = 800
    summary = trade_summary_json if len(trade_summary_json) <= summary_cap else trade_summary_json[:summary_cap] + "\n..."

    return (
        f"I've uploaded my trading history ({n} trades from {date_min} to {date_max}).\n\n"
        f"Overall P&L: ${total_pnl:,.2f} | Win rate: {win_rate:.1f}%\n\n"
        "Model-derived bias scores:\n"
        f"- Overtrading: avg_score={ot['avg_score']:.2%} across {len(ot['windows'])} windows\n"
        f"- Revenge Trading: avg_score={rv['avg_score']:.2%} across {len(rv['windows'])} post-loss events\n"
        f"- Loss Aversion: avg_score={la['avg_score']:.2%} across {len(la['windows'])} windows\n\n"
        "Precomputed trade summary (JSON):\n"
        f"```json\n{summary}\n```\n\n"
        "Generate your expert analysis report. Use get_trade_summary and query_trade_data as needed for evidence."
    )


# ---------------------------------------------------------------------------
# Public API  (sync wrappers around async internals)
# ---------------------------------------------------------------------------


def create_analysis_session(df: pd.DataFrame, scores: dict) -> dict:
    """Run the three-model scores through the agent and return a report.

    Returns
    -------
    dict
        {"thread_id": str, "report": str}
    """
    return asyncio.run(_create_analysis_session(df, scores))


def create_analysis_session_streaming(
    df: pd.DataFrame,
    scores: dict,
    progress_callback: Callable[[dict], None],
) -> dict:
    """Like ``create_analysis_session`` but streams progress via *callback*.

    The callback receives dicts such as::

        {"type": "agent_event", "action": "...", "rationale": "...", "observation": "..."}

    Returns the same ``{"thread_id": str, "report": str}`` dict.
    """
    return asyncio.run(_create_analysis_session(df, scores, progress_callback))


async def _create_analysis_session(
    df: pd.DataFrame,
    scores: dict,
    progress_callback: Callable[[dict], None] | None = None,
) -> dict:
    client = BackboardClient(api_key=_get_api_key())
    assistant_id = await _ensure_assistant(client)
    thread = await client.create_thread(assistant_id)

    if isinstance(thread, dict):
        tid = thread.get("thread_id", thread.get("id", ""))
    else:
        tid = getattr(thread, "thread_id", getattr(thread, "id", ""))
    tid = str(tid) if tid else ""

    db_conn = _load_into_duckdb(df, scores=scores)

    # Initialize per-thread histories
    session: Session = {
        "db_conn": db_conn,
        "user_message_history": [],
        "investigation_history": [],
    }
    _sessions[tid] = session

    # Register progress callback and set context var for streaming
    if progress_callback:
        _progress_callbacks[tid] = progress_callback
    token = _active_thread_id.set(tid)

    try:
        # Orchestrated in code: compute summary up front.
        summary_json = _get_trade_summary(db_conn)
        prompt = _build_analysis_prompt(df, scores, summary_json)

        report = await _send_and_resolve_langgraph(
            client,
            tid,
            prompt,
            session,
            task_name="Initial analysis report",
        )
        _persist_session(tid, session, df, scores)
        return {"thread_id": tid, "report": report}
    finally:
        _active_thread_id.reset(token)
        _progress_callbacks.pop(tid, None)


def agent_chat(thread_id: str, message: str) -> str:
    """Send a follow-up chat message and return the agent's response."""
    return asyncio.run(_agent_chat(thread_id, message))


async def _agent_chat(thread_id: str, message: str) -> str:
    thread_id = str(thread_id).strip() if thread_id else ""
    if not thread_id or thread_id not in _sessions:
        session = _load_session_from_disk(thread_id)
        if session is None:
            raise ValueError("Session not found. Please re-upload your trade data.")
        _sessions[thread_id] = session

    session = _sessions[thread_id]
    client = BackboardClient(api_key=_get_api_key())

    response = await _send_and_resolve_langgraph(
        client,
        thread_id,
        message,
        session,
        task_name="Follow-up chat",
    )
    _persist_session(thread_id, session, df=None)
    return response
