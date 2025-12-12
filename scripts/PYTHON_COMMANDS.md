# Python Commands Reference

## ✅ Current Status

- **Python 3.13.3** is installed ✅
- **pip 25.0.1** is working ✅
- **`py` command** works ✅
- **`python` command** - needs terminal restart to work

## Using `py` Command (Works Now!)

Since `py` works, you can use it for everything:

```powershell
# Instead of: python --version
py --version

# Instead of: pip install package
py -m pip install package

# Instead of: python script.py
py script.py
```

## Install Conversion Tools (Use `py`)

Run this command now (no restart needed):

```powershell
py -m pip install tensorflowjs onnx onnx-tf torch
```

This will install:
- `tensorflowjs` - TensorFlow.js converter
- `onnx` - ONNX format support
- `onnx-tf` - ONNX to TensorFlow converter
- `torch` - PyTorch (for loading Open-Unmix models)

## After Terminal Restart

If you restart PowerShell/terminal later, `python` command should work:

```powershell
python --version  # Should work after restart
pip install ...   # Should work after restart
```

But `py` will continue to work either way!

## Quick Test

Try installing the tools now:

```powershell
py -m pip install tensorflowjs onnx onnx-tf torch
```

This should work immediately without restarting.


