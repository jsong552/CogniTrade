import base64
import json
import os
import sys
from threading import Thread

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sock import Sock
from dotenv import load_dotenv
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect as ws_connect

# Add the backend directory to path for importing the bias detector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from journal_model_training_script.train_bias_detector import TradingBiasDetector

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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
