# Converting Open-Unmix Models - Step by Step

## Summary

**No pre-converted models found.** We'll convert them ourselves using Python 3.12.

## Prerequisites

✅ Python 3.12 installed (you have this)
⏳ Conversion tools installed

## Step 1: Install Conversion Tools

Open PowerShell and run:

```powershell
py -3.12 -m pip install torch openunmix tensorflowjs onnx onnx-tf
```

This installs:
- `torch` - PyTorch (for loading Open-Unmix models)
- `openunmix` - Open-Unmix library
- `tensorflowjs` - TensorFlow.js converter
- `onnx` - ONNX format support
- `onnx-tf` - ONNX to TensorFlow converter

## Step 2: Run Conversion Script

I've created `scripts/convert_open_unmix_2stems.py` that will:

1. Download Open-Unmix 2-stem models (vocals + accompaniment)
2. Convert PyTorch → ONNX → TensorFlow.js
3. Save to `converted_models/umx-2stems/`

Run it:

```powershell
cd "C:\Users\Jamie\Documents\Ai Dev Tools\Sampler Extension\Unified Sampler"
py -3.12 scripts/convert_open_unmix_2stems.py
```

## Step 3: Copy Models to Project

After conversion, copy models to your project:

```powershell
# Create directories
mkdir -p public\models\umx-2stems\vocals
mkdir -p public\models\umx-2stems\accompaniment

# Copy files
copy converted_models\umx-2stems\vocals\* public\models\umx-2stems\vocals\
copy converted_models\umx-2stems\accompaniment\* public\models\umx-2stems\accompaniment\
```

## Step 4: Update UI Default

Change default model type to `2stems` in `App.tsx`:

```typescript
const [stemModelType, setStemModelType] = useState<'2stems' | '4stems' | '5stems'>('2stems');
```

## Step 5: Test

1. Build extension: `npm run build`
2. Load extension in Chrome
3. Load audio file
4. Click "Separate Stems"
5. Should get vocals and accompaniment stems

## Expected File Structure

```
public/
└── models/
    └── umx-2stems/
        ├── vocals/
        │   ├── model.json
        │   └── weights*.bin (one or more files)
        └── accompaniment/
            ├── model.json
            └── weights*.bin (one or more files)
```

## Troubleshooting

**If conversion fails:**
- Make sure Python 3.12 is used: `py -3.12 --version`
- Check all packages installed: `py -3.12 -m pip list`
- Try installing packages one by one to identify issues

**If models don't load:**
- Check browser console for errors
- Verify file paths match what code expects
- Ensure `model.json` and weight files are in correct locations

## Alternative: Manual Download

If script doesn't work, you can manually:

1. Download Open-Unmix PyTorch models from:
   - https://github.com/sigsep/open-unmix-pytorch
   - Or use: `python -c "import openunmix; openunmix.umx(pretrained=True)"`

2. Convert using TensorFlow.js converter manually

3. Place files in `public/models/umx-2stems/`

## Next Steps

1. Install tools (Step 1)
2. Run conversion (Step 2)
3. Copy models (Step 3)
4. Test!
