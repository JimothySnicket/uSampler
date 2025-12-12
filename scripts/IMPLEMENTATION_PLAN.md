# Stem Separation Implementation Plan

## Goal
Add local stem separation using a bundled TensorFlow.js model.

## Model Choice: Open-Unmix 2-Stem

**Why 2-stem:**
- ✅ Smaller size (~100-150 MB total)
- ✅ Most common use case (vocals vs instrumental)
- ✅ Good quality
- ✅ Easier to implement

**What it separates:**
- Vocals
- Instrumental (everything else)

## Implementation Steps

### Step 1: Get the Model Files

**Option A: Use Pre-Converted Models (Easiest)**
1. Search GitHub for "open-unmix tensorflow.js"
2. Download pre-converted 2-stem model
3. Place files in `public/models/umx-2stems/`

**Option B: Convert Yourself**
1. Download Open-Unmix PyTorch model
2. Convert using Python 3.12 + tensorflowjs
3. Place converted files in `public/models/umx-2stems/`

### Step 2: File Structure

```
public/
└── models/
    └── umx-2stems/
        ├── vocals/
        │   ├── model.json
        │   └── weights.bin (or weights1.bin, weights2.bin, etc.)
        └── accompaniment/
            ├── model.json
            └── weights.bin
```

### Step 3: Update Code (Already Done!)

Your code in `src/utils/stemSeparator.ts` already:
- ✅ Loads models lazily
- ✅ Supports 2-stem model type
- ✅ Handles model loading and caching

**Just need to:**
- Set `modelType: '2stems'` in the UI
- Place model files in the right location

### Step 4: Test

1. Load audio file
2. Click "Separate Stems"
3. Select "2-stem" model
4. Process
5. Should get vocals and instrumental stems

## What You Need to Do

### Quick Path (If Pre-Converted Models Exist):

1. **Find pre-converted model:**
   - Search: "open-unmix tensorflow.js 2stems"
   - Or: "open-unmix tfjs model download"
   - Check GitHub, Hugging Face, or model repositories

2. **Download and extract:**
   - Should have `vocals/` and `accompaniment/` folders
   - Each folder has `model.json` and weight files

3. **Place in project:**
   ```
   public/models/umx-2stems/vocals/
   public/models/umx-2stems/accompaniment/
   ```

4. **Update UI** to default to `2stems` instead of `5stems`

### Conversion Path (If No Pre-Converted Models):

1. **Install tools** (Python 3.12):
   ```powershell
   py -3.12 -m pip install tensorflowjs torch openunmix
   ```

2. **Download Open-Unmix PyTorch model:**
   ```python
   import openunmix
   # Download 2-stem model
   ```

3. **Convert to TensorFlow.js:**
   ```powershell
   # Convert PyTorch -> ONNX -> TensorFlow.js
   py -3.12 convert_model.py
   ```

4. **Place converted files** in `public/models/umx-2stems/`

## Current Code Status

✅ **Already implemented:**
- Model loading logic
- Lazy loading
- Caching
- UI integration
- Error handling

⏳ **What's missing:**
- Actual model files in `public/models/umx-2stems/`

## Next Action

**Try to find pre-converted models first!**

Search:
- GitHub: "open-unmix tensorflow.js"
- Hugging Face: "open-unmix"
- Check if anyone has already converted them

If found → Download → Place in project → Done!

If not found → We'll convert them using Python 3.12

## Recommendation

Start by searching for pre-converted models. Much easier than converting yourself!

