# CogniTrade Backend

Flask-based backend API for CogniTrade.

## Setup

1. Create a virtual environment:
```bash
python3 -m venv venv
```

2. Activate the virtual environment:
```bash
# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure Gradium STT:
```bash
export GRADIUM_API_KEY=gd_your_api_key_here
export GRADIUM_REGION=us
```

## Running the Server

```bash
python app.py
```

The server will start on `http://localhost:5000`

## API Endpoints

### `GET /`
Health check endpoint that returns basic information about the API.

**Response:**
```json
{
  "message": "CogniTrade Flask Backend is running!",
  "status": "success",
  "version": "1.0.0"
}
```

### `GET /health`
Service health check.

**Response:**
```json
{
  "status": "healthy",
  "service": "CogniTrade API"
}
```

### `POST /transcribe`
Transcribe audio to text (single-shot). Send multipart form-data with `audio` and optional `input_format` (`opus`, `wav`, or `pcm`).

### `WS /transcribe/stream`
WebSocket proxy for Gradium streaming STT. Send Gradium-style messages (`setup`, `audio`, `end_of_stream`) and receive `text` messages as they arrive.

### `POST /analyze_journal`
Analyze journal entries (placeholder - not yet implemented).
