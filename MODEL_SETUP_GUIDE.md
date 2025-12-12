# Model Setup Guide

## RNNoise - Already Integrated! ✅

RNNoise is now installed via npm (`@timephy/rnnoise-wasm`). However, the package is designed for AudioWorklet (real-time processing), not offline processing.

**Current Status:**
- ✅ Package installed
- ✅ Falls back to spectral gating (works well for most noise reduction)
- ⚠️ Full RNNoise integration requires AudioWorklet setup for real-time streams

**Spectral Gating** (current fallback) works excellently for:
- Background hiss
- Constant noise
- General noise reduction
- Works with any audio length

## Open-Unmix Models - Need Conversion

### Option 1: Use Pre-converted Models (Easiest)

Search for pre-converted TensorFlow.js models:
- GitHub: Search "open-unmix tensorflow.js"
- Check if community has shared converted models
- Look for model hubs with TensorFlow.js format

### Option 2: Convert Models Yourself

See `scripts/convert-open-unmix-models.md` for detailed conversion instructions.

**Quick Start:**
1. Install conversion tools: `pip install tensorflowjs onnx onnx-tf`
2. Download Open-Unmix PyTorch models from: https://github.com/sigsep/open-unmix-pytorch
3. Convert: PyTorch → ONNX → TensorFlow.js
4. Place files in `public/models/umx-5stems/`

### Option 3: Use Server-Side Processing (Already Implemented)

The server-side implementation is already complete and ready to use:
- Set server endpoint in UI
- Works immediately without model conversion
- Better performance for long audio files

## Current Implementation Status

✅ **Noise Reduction**: Working (spectral gating)
✅ **Stem Separation**: Code ready, needs model files
✅ **Web Workers**: Implemented for long files
✅ **Progress Tracking**: Implemented
✅ **Error Handling**: Graceful fallbacks

## Testing Without Models

You can test the UI and error handling even without models:
- Noise reduction works immediately (spectral gating)
- Stem separation will show appropriate error messages
- Server-side stem separation works if you have a backend

## Next Steps

1. **For immediate use**: Noise reduction works now with spectral gating
2. **For stem separation**: Either convert models or set up server endpoint
3. **For best RNNoise**: Implement AudioWorklet integration (future enhancement)


