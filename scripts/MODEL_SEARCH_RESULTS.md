# Model Search Results

## Search Summary

I searched for pre-converted Open-Unmix TensorFlow.js models but didn't find readily available pre-converted models.

## What I Found

- **Conversion guides** - Lots of tutorials on HOW to convert
- **No pre-converted models** - Didn't find ready-to-download TensorFlow.js versions

## Why This Makes Sense

Open-Unmix models are:
- Large (~100-500 MB)
- Not commonly pre-converted to TensorFlow.js
- Usually used server-side (PyTorch)
- Browser-based use is less common

## Our Options

### Option 1: Convert Ourselves (Recommended)

Since pre-converted models aren't readily available, we should convert them:

1. **Download Open-Unmix PyTorch models** (official, available)
2. **Convert PyTorch → ONNX → TensorFlow.js** using Python 3.12
3. **Place in project**

### Option 2: Use Alternative Lightweight Model

Search for other vocal separation models that:
- Are already converted to TensorFlow.js
- Are smaller/lighter
- Work in browser

### Option 3: Skip ML Models, Use Spectral Separation

Implement FFT-based vocal separation (no ML):
- Much smaller (~0 MB)
- Lower quality
- But works immediately

## Recommendation

**Convert Open-Unmix 2-stem model ourselves** using Python 3.12.

**Next steps:**
1. Create conversion script
2. Download official Open-Unmix PyTorch model
3. Convert to TensorFlow.js
4. Test

Would you like me to create the conversion script?

