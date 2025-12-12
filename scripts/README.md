# Model Conversion Scripts - Quick Start

## ✅ Python is Installed!

You have Python 3.13.3 installed. Use `py` command instead of `python`.

## Next Steps

### 1. Install Conversion Tools

Open PowerShell and run:

```powershell
py -m pip install tensorflowjs onnx onnx-tf torch
```

### 2. Choose Your Path

**Option A: Convert Models Yourself**
- See: `convert-open-unmix-models.md`
- Download Open-Unmix PyTorch models
- Convert to TensorFlow.js format
- Place in `public/models/umx-5stems/`

**Option B: Use Server-Side Processing**
- Already implemented in the code
- Just set server endpoint in UI
- No model conversion needed

**Option C: Find Pre-converted Models**
- Search GitHub for "open-unmix tensorflow.js"
- Download pre-converted models
- Place in `public/models/umx-5stems/`

## File Guide

- `INSTALL_PYTHON.md` - Python installation guide
- `PYTHON_COMMANDS.md` - Using `py` vs `python` commands
- `INSTALL_CONVERSION_TOOLS.md` - Installing pip packages
- `convert-open-unmix-models.md` - Detailed conversion steps
- `QUICK_INSTALL.md` - Quick reference for installing tools
- `CONVERSION_INSTRUCTIONS.md` - Where to run commands
- `VERIFY_PYTHON.md` - Troubleshooting Python installation

## Current Status

✅ Python installed (use `py` command)
⏳ Conversion tools - install with: `py -m pip install tensorflowjs onnx onnx-tf torch`
⏳ Models - need to download and convert

## Quick Commands Reference

```powershell
# Check Python version
py --version

# Install packages
py -m pip install package-name

# List installed packages
py -m pip list

# Run Python script
py script.py
```


