# Server Integration Guide

## Overview

For computationally intensive audio processing tasks (primarily stem separation), a server-side fallback can provide better performance and quality. This document outlines how to set up and use server-side processing.

## Supported Features

### Stem Separation (Recommended for Server)

Browser-based stem separation using TensorFlow.js has limitations:
- Large model files (50-200MB) need to be downloaded
- Processing can be slow and may block the UI
- Limited to models that fit in browser memory

Server-side solutions offer:
- Faster processing with dedicated hardware
- Access to more powerful models (Demucs, Spleeter)
- Better memory management
- No impact on browser performance

## Server Setup Options

### Option 1: Spleeter (Recommended)

**License:** MIT (Commercial-friendly)

**Setup:**
```bash
# Install Spleeter
pip install spleeter

# Or with Docker
docker pull researchdeezer/spleeter:latest
```

**API Endpoint Example (Flask/Python):**
```python
from flask import Flask, request, send_file
from spleeter.separator import Separator
import tempfile
import os

app = Flask(__name__)

# Initialize separator (4stems model)
separator = Separator('spleeter:4stems-16kHz')

@app.route('/separate', methods=['POST'])
def separate():
    audio_file = request.files['audio']
    model_type = request.form.get('model', '4stems')
    
    # Save uploaded file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
        audio_file.save(tmp.name)
        input_path = tmp.name
    
    # Create output directory
    output_dir = tempfile.mkdtemp()
    
    # Separate stems
    separator.separate_to_file(input_path, output_dir)
    
    # Return stems as separate files or combined archive
    # Implementation depends on your needs
    
    return {'stems': {...}}  # Return stem URLs or data
```

### Option 2: Demucs (Higher Quality)

**License:** MIT (Commercial-friendly)

**Setup:**
```bash
pip install demucs
```

**API Endpoint Example:**
```python
from demucs.pretrained import get_model
from demucs.apply import apply_model
import torch

model = get_model('htdemucs')
model.eval()

@app.route('/separate', methods=['POST'])
def separate():
    # Load audio
    # Apply model
    # Return separated stems
    pass
```

### Option 3: Open-Unmix (Lightweight)

**License:** MIT (Commercial-friendly)

**Setup:**
```bash
pip install openunmix
```

## API Contract

### Request Format

**POST** `/separate`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `audio`: Audio file (WAV, MP3, FLAC, etc.)
- `model`: Model type (`2stems`, `4stems`, `5stems`)

### Response Format

**Success (200 OK):**
```json
{
  "vocals": "base64_encoded_audio_data_or_url",
  "drums": "base64_encoded_audio_data_or_url",
  "bass": "base64_encoded_audio_data_or_url",
  "other": "base64_encoded_audio_data_or_url",
  "accompaniment": "base64_encoded_audio_data_or_url"  // Optional
}
```

**Error (4xx/5xx):**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Client Implementation

The `stemSeparator.ts` module includes `separateStemsServer()` function that:

1. Converts `AudioBuffer` to WAV format
2. Sends POST request to server endpoint
3. Handles response and converts back to `AudioBuffer`
4. Returns `StemSeparationResult`

## Usage Example

```typescript
import { engine } from './audio-engine';

const buffer = /* your AudioBuffer */;
const apiEndpoint = 'https://your-api.com/separate';

const result = await engine.separateStemsServer(
    buffer,
    apiEndpoint,
    { modelType: '4stems' }
);

if (result) {
    // Use separated stems
    if (result.vocals) {
        // Process vocals
    }
    if (result.drums) {
        // Process drums
    }
    // etc.
}
```

## Security Considerations

1. **CORS:** Server must allow requests from your extension origin
2. **Authentication:** Consider API keys or OAuth for production
3. **File Size Limits:** Set appropriate limits for uploaded audio
4. **Rate Limiting:** Implement rate limiting to prevent abuse
5. **Timeout Handling:** Set reasonable timeouts for long-processing audio

## Performance Notes

- Processing time depends on audio length and model complexity
- 4stems model typically processes 1 minute of audio in 10-30 seconds
- Consider async processing with webhooks for longer audio files
- Implement progress callbacks if supported

## Future Enhancements

- WebSocket-based progress updates
- Batch processing for multiple files
- Caching of processed results
- Compression of returned audio data


