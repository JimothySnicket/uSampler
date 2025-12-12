# Installing Model Conversion Tools

## ✅ Python is Installed!

Python 3.13.3 is installed and accessible via `py` command.

## Install Conversion Tools

Run these commands in PowerShell (you can use `py` instead of `python`):

```powershell
# Install TensorFlow.js converter
py -m pip install tensorflowjs

# Install ONNX tools
py -m pip install onnx onnx-tf

# Install PyTorch (for loading Open-Unmix models)
py -m pip install torch

# Optional: Install Open-Unmix package
py -m pip install openunmix
```

## Quick Install (All at Once)

```powershell
py -m pip install tensorflowjs onnx onnx-tf torch openunmix
```

## Verify Installation

After installation, verify tools are available:

```powershell
# Check TensorFlow.js converter
tensorflowjs_converter --version
# OR
py -m tensorflowjs.converters --version

# Check pip packages
py -m pip list | Select-String "tensorflowjs|onnx|torch"
```

## Next Steps

Once tools are installed, you can proceed with model conversion:
- See: `scripts/convert-open-unmix-models.md`
- Or use: `scripts/convert_open_unmix.py`

## Note About `py` vs `python`

- ✅ Use `py` command (Windows Python launcher) - works now
- ❌ `python` command - not in PATH, but `py` works fine
- ✅ Use `py -m pip` instead of `pip` directly


