# Verifying Python Installation

## Python Not Detected Yet?

If you just installed Python, you may need to:

### 1. Restart Your Terminal/PowerShell

**Close and reopen PowerShell completely:**
- Close the current PowerShell window
- Open a new PowerShell window
- Try again: `python --version`

### 2. Try the Windows Python Launcher

Windows has a Python launcher that might work:

```powershell
py --version
```

If this works, you can use `py` instead of `python`:
```powershell
py -m pip install tensorflowjs
```

### 3. Check Installation Location

Python might be installed but not in PATH. Check common locations:

```powershell
# Check if Python is in common locations
Test-Path "C:\Python312\python.exe"
Test-Path "C:\Program Files\Python312\python.exe"
Test-Path "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
```

### 4. Reinstall with PATH Option

If Python still isn't found:

1. **Uninstall Python** (if installed)
2. **Download again** from: https://www.python.org/downloads/
3. **During installation:**
   - ✅ Check "Add Python to PATH" (at the bottom)
   - ✅ Check "Install pip"
4. **Restart computer** (or at least restart PowerShell)

### 5. Manual PATH Addition (Advanced)

If Python is installed but not in PATH:

1. Find Python installation (usually `C:\Users\YourName\AppData\Local\Programs\Python\Python312\`)
2. Add to PATH manually:
   - Search "Environment Variables" in Windows
   - Edit System Environment Variables
   - Add Python folder and Scripts folder to PATH

## Quick Test

After restarting PowerShell, run:

```powershell
python --version
# OR
py --version
```

If you see a version number, Python is installed correctly!

## Next Steps

Once Python works:

```powershell
# Install conversion tools
pip install tensorflowjs onnx onnx-tf torch
# OR if using py launcher:
py -m pip install tensorflowjs onnx onnx-tf torch
```


