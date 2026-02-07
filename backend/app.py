from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

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

# Transcribe endpoint (placeholder)
@app.route('/transcribe', methods=['POST'])
def transcribe():
    # TODO: Implement transcription logic
    pass

# Analyze journal endpoint (placeholder)
@app.route('/analyze_journal', methods=['POST'])
def analyze_journal():
    # TODO: Implement journal analysis logic
    pass

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
