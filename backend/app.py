import base64
import io
import json
import os
import queue
import sys
from threading import Thread

import pandas as pd
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from flask_sock import Sock
from dotenv import load_dotenv
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect as ws_connect

# Add the backend directory to path for importing modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from journal_model_training_script.train_bias_detector import TradingBiasDetector
from models.overtrading_model.predict_overtrading import score_overtrading
from models.revenge_trading_model.revenge_inference import score_revenge
from models.loss_aversion_trading_model.loss_aversion_inference import score_loss_aversion
from agent import create_analysis_session_streaming, agent_chat

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
sock = Sock(app)

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Initialize the Trading Bias Detector (lazy loading to speed up startup)
_bias_detector = None

def get_bias_detector():
    """Lazy load the bias detector on first use."""
    global _bias_detector
    if _bias_detector is None:
        print("Loading Trading Bias Detector model...")
        _bias_detector = TradingBiasDetector()
        print("Trading Bias Detector model loaded successfully!")
    return _bias_detector


def _gradium_ws_url() -> str:
    region = os.getenv('GRADIUM_REGION', 'us').lower()
    if region not in {'us', 'eu'}:
        region = 'us'
    return f"wss://{region}.api.gradium.ai/api/speech/asr"

# Simple test endpoint
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'message': 'CogniTrade Flask Backend is running!',
        'status': 'success',
        'version': '1.0.0'
    })

# Health check endpoint
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'service': 'CogniTrade API'
    })

# Transcribe endpoint (single-shot)
@app.route('/transcribe', methods=['POST'])
def transcribe():
    api_key = os.getenv('GRADIUM_API_KEY')
    if not api_key:
        return jsonify({'error': 'GRADIUM_API_KEY is not set'}), 500

    if 'audio' not in request.files:
        return jsonify({'error': 'Missing audio file (field: audio)'}), 400

    input_format = request.form.get('input_format', 'opus')
    audio_bytes = request.files['audio'].read()
    audio_b64 = base64.b64encode(audio_bytes).decode('ascii')

    transcript_parts = []

    with ws_connect(_gradium_ws_url(), additional_headers={'x-api-key': api_key}) as grad_ws:
        grad_ws.send(json.dumps({
            'type': 'setup',
            'model_name': 'default',
            'input_format': input_format,
        }))

        grad_ws.send(json.dumps({'type': 'audio', 'audio': audio_b64}))
        grad_ws.send(json.dumps({'type': 'end_of_stream'}))

        for message in grad_ws:
            data = json.loads(message)
            if data.get('type') == 'text' and data.get('text'):
                transcript_parts.append(data['text'])
            if data.get('type') == 'end_of_stream':
                break

    return jsonify({'text': ' '.join(transcript_parts).strip()})


@sock.route('/transcribe/stream')
def transcribe_stream(ws):
    api_key = os.getenv('GRADIUM_API_KEY')
    if not api_key:
        ws.send(json.dumps({'type': 'error', 'message': 'GRADIUM_API_KEY is not set'}))
        return

    with ws_connect(_gradium_ws_url(), additional_headers={'x-api-key': api_key}) as grad_ws:
        def relay_from_gradium():
            try:
                for message in grad_ws:
                    ws.send(message)
            except Exception:
                ws.send(json.dumps({'type': 'error', 'message': 'Gradium connection closed'}))

        relay_thread = Thread(target=relay_from_gradium, daemon=True)
        relay_thread.start()

        while True:
            message = ws.receive()
            if message is None:
                break
            try:
                grad_ws.send(message)
            except ConnectionClosed:
                ws.send(json.dumps({'type': 'error', 'message': 'Gradium connection closed'}))
                break

# Analyze journal endpoint - Trading Bias Detector
@app.route('/analyze_journal', methods=['POST'])
def analyze_journal():
    """
    Analyze a trading journal entry for psychological biases.
    
    Request body (JSON):
        - text: The journal entry text to analyze
    
    Response:
        - biases: Dictionary of bias names to probability scores (0-1)
        - detected: List of biases above the 0.4 threshold
        - message: Human-readable summary
        - percentages: Dictionary of bias names to percentage strings
    """
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({
                'error': 'Missing required field: text',
                'usage': 'POST with JSON body: {"text": "Your journal entry here..."}'
            }), 400
        
        text = data['text'].strip()
        
        if not text:
            return jsonify({
                'error': 'Text field cannot be empty'
            }), 400
        
        # Get the bias detector and run inference
        detector = get_bias_detector()
        result = detector.predict(text)
        
        return jsonify({
            'success': True,
            'biases': result['biases'],
            'detected': result['detected'],
            'message': result['message'],
            'percentages': result['percentages']
        })
        
    except Exception as e:
        return jsonify({
            'error': f'Analysis failed: {str(e)}'
        }), 500

# ---------------------------------------------------------------------------
# Analyze trades endpoint — CSV upload → overtrading + revenge + loss aversion
# ---------------------------------------------------------------------------

_REQUIRED_COLS = {
    'timestamp', 'asset', 'side', 'quantity',
    'entry_price', 'exit_price', 'profit_loss', 'balance',
}

@app.route('/analyze_trades', methods=['POST'])
def analyze_trades():
    """
    Accept a CSV of trades and return overtrading, revenge-trading,
    and loss-aversion scores.

    Request: multipart/form-data with field ``file`` (CSV).
    Response JSON::

        {
            "success": true,
            "overtrading":    { "windows": [...], "avg_score": 0.72 },
            "revenge":        { "windows": [...], "avg_score": 0.45 },
            "loss_aversion":  { "windows": [...], "avg_score": 0.31 }
        }
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'error': 'Missing CSV file (field: file)',
                'usage': 'POST multipart/form-data with a CSV file field named "file".',
            }), 400

        file = request.files['file']
        if not file.filename:
            return jsonify({'error': 'Empty filename'}), 400

        # Read CSV into DataFrame
        try:
            raw = file.read().decode('utf-8')
            df = pd.read_csv(io.StringIO(raw))
        except Exception as e:
            return jsonify({'error': f'Failed to parse CSV: {e}'}), 400

        # Validate required columns
        missing = _REQUIRED_COLS - set(df.columns)
        if missing:
            return jsonify({
                'error': f'CSV is missing required columns: {sorted(missing)}',
                'required': sorted(_REQUIRED_COLS),
            }), 400

        # Run all three scorers
        ot_result = score_overtrading(df)
        rv_result = score_revenge(df)
        la_result = score_loss_aversion(df)

        return jsonify({
            'success': True,
            'overtrading': ot_result,
            'revenge': rv_result,
            'loss_aversion': la_result,
        })

    except Exception as e:
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500


# ---------------------------------------------------------------------------
# Agent endpoints — LLM-powered expert analysis + follow-up chat
# ---------------------------------------------------------------------------

@app.route('/agent/analyze', methods=['POST'])
def agent_analyze():
    """Upload a CSV, run the three bias models, then generate an LLM expert
    report via Backboard AI.

    Streams progress back as **Server-Sent Events** so the frontend can show
    live status updates while ML models and the AI agent are working.

    Request: multipart/form-data with field ``file`` (CSV).
    SSE event types:
        - ``progress``    -- step description (ML model or agent phase)
        - ``agent_event`` -- tool call / rationale from the AI agent
        - ``scores``      -- bias model scores are ready
        - ``result``      -- final report + thread_id + scores
        - ``error``       -- something went wrong
        - ``done``        -- stream finished
    """
    # ---- validate input (returns JSON on error) ----------------------------
    if 'file' not in request.files:
        return jsonify({'error': 'Missing CSV file (field: file)'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    try:
        raw = file.read().decode('utf-8')
        df = pd.read_csv(io.StringIO(raw))
    except Exception as e:
        return jsonify({'error': f'Failed to parse CSV: {e}'}), 400

    missing = _REQUIRED_COLS - set(df.columns)
    if missing:
        return jsonify({
            'error': f'CSV is missing required columns: {sorted(missing)}',
            'required': sorted(_REQUIRED_COLS),
        }), 400

    # ---- stream analysis progress via SSE ----------------------------------
    event_queue: queue.Queue = queue.Queue()

    def _progress_cb(event: dict):
        event_queue.put(event)

    def _run_analysis():
        try:
            # Phase 1: ML model scoring
            event_queue.put({
                'type': 'progress', 'step': 'overtrading_model',
                'message': 'Running overtrading detection model...',
            })
            ot_result = score_overtrading(df)

            event_queue.put({
                'type': 'progress', 'step': 'revenge_model',
                'message': 'Running revenge trading detection model...',
            })
            rv_result = score_revenge(df)

            event_queue.put({
                'type': 'progress', 'step': 'loss_aversion_model',
                'message': 'Running loss aversion detection model...',
            })
            la_result = score_loss_aversion(df)

            scores = {
                'overtrading': ot_result,
                'revenge': rv_result,
                'loss_aversion': la_result,
            }
            event_queue.put({'type': 'scores', 'scores': scores})

            # Phase 2: AI agent analysis
            event_queue.put({
                'type': 'progress', 'step': 'agent_start',
                'message': 'Starting AI expert analysis...',
            })
            session = create_analysis_session_streaming(df, scores, _progress_cb)

            event_queue.put({
                'type': 'result',
                'success': True,
                'thread_id': session['thread_id'],
                'report': session['report'],
                'scores': scores,
            })
        except Exception as exc:
            event_queue.put({
                'type': 'error',
                'message': f'Agent analysis failed: {exc}',
            })
        finally:
            event_queue.put(None)  # sentinel

    thread = Thread(target=_run_analysis, daemon=True)
    thread.start()

    def _generate():
        while True:
            try:
                event = event_queue.get(timeout=300)  # 5 min for ML + agent with retries
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Analysis timed out'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            if event is None:
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return Response(
        _generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )


@app.route('/agent/chat', methods=['POST'])
def agent_chat_endpoint():
    """Send a follow-up message to the agent on an existing thread.

    Responds with **Server-Sent Events** so the frontend can show a
    streaming-style UX.  Events:

    - ``{"type": "start"}``          -- agent is working
    - ``{"type": "content", "text": "..."}``  -- agent response text
    - ``{"type": "done"}``           -- finished
    - ``{"type": "error", "message": "..."}`` -- something went wrong
    """
    data = request.get_json(silent=True) or {}
    thread_id = data.get('thread_id', '')
    message = data.get('message', '').strip()

    if not thread_id or not message:
        return jsonify({
            'error': 'Both thread_id and message are required.',
        }), 400

    def _generate():
        yield f"data: {json.dumps({'type': 'start'})}\n\n"
        try:
            text = agent_chat(thread_id, message)
            yield f"data: {json.dumps({'type': 'content', 'text': text})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return Response(
        _generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
