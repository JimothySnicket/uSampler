# Installing Python for Model Conversion

## Quick Check

The Python extension in your IDE is different from having Python installed. Let's check if Python is actually installed:

```powershell
python --version
```

If you see an error like "python is not recognized", Python is not installed.

## Installing Python on Windows

### Option 1: Official Python Installer (Recommended)

1. **Download Python:**
   - Visit: https://www.python.org/downloads/
   - Click "Download Python 3.x.x" (latest version)

2. **During Installation:**
   - ✅ **IMPORTANT:** Check the box "Add Python to PATH"
   - This allows you to use `python` and `pip` from any terminal
   - Click "Install Now"

3. **Verify Installation:**
   - Close and reopen PowerShell/Command Prompt
   - Run: `python --version`
   - Should show: `Python 3.x.x`

### Option 2: Microsoft Store (Easier)

1. Open Microsoft Store
2. Search for "Python 3.11" or "Python 3.12"
3. Click "Install"
4. Automatically adds to PATH

### Option 3: Using Winget (Windows Package Manager)

```powershell
winget install Python.Python.3.11
```

## After Installation

1. **Restart your terminal** (close and reopen PowerShell)
2. **Verify Python:**
   ```powershell
   python --version
   ```
3. **Verify pip (Python package manager):**
   ```powershell
   pip --version
   ```

## Next Steps

Once Python is installed, you can proceed with:

```powershell
# Install conversion tools
pip install tensorflowjs onnx onnx-tf torch

# Then follow the conversion guide
# See: scripts/convert-open-unmix-models.md
```

## Troubleshooting

**"python is not recognized" after installation:**
- Restart your terminal/IDE
- Check if Python was added to PATH:
  - Search "Environment Variables" in Windows
  - Check if Python is in System PATH
- Try `py` instead of `python`:
  ```powershell
  py --version
  ```

**"pip is not recognized":**
- Python might not have pip installed
- Try: `python -m pip --version`
- Or reinstall Python with "pip" option checked

## Using Python Extension in Cursor/VS Code

The Python extension you installed provides:
- Syntax highlighting
- IntelliSense
- Debugging
- But **NOT** the Python runtime itself

You still need to install Python separately for running commands.


