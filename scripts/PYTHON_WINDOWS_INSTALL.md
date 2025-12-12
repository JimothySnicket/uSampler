# Installing Python on Windows - Correct Method

## Issue: Wrong File Format

You downloaded: `Python-3.12.12.tar.xz`
- ❌ This is a Linux/Unix archive
- ❌ Won't work on Windows
- ✅ You need the Windows `.exe` installer instead

## Correct Download for Windows

### Option 1: Direct Download (Recommended)

1. **Visit:** https://www.python.org/downloads/
2. **Click the big yellow button:** "Download Python 3.12.x"
   - This automatically detects Windows and downloads the `.exe` installer
3. **Or direct link:** https://www.python.org/ftp/python/3.12.12/python-3.12.12-amd64.exe
   - (For 64-bit Windows, which most modern PCs use)

### Option 2: Microsoft Store (Easiest)

1. Open Microsoft Store
2. Search "Python 3.12"
3. Click "Install"
4. Automatically handles everything

## Installation Steps

1. **Run the `.exe` installer** (not the .tar.xz file)
2. **IMPORTANT:** Check ✅ "Add Python to PATH" at the bottom
3. Click "Install Now"
4. Wait for installation to complete

## Verify Installation

After installation, **close and reopen PowerShell**, then:

```powershell
python --version
# Should show: Python 3.12.12

pip --version
# Should show: pip version number
```

## Delete the Wrong File

You can delete the `.tar.xz` file you downloaded - it's not needed:
```
C:\Users\Jamie\AppData\Local\Temp\MicrosoftEdgeDownloads\d09828f4-ca02-4056-b4c1-5152fbb34511\Python-3.12.12.tar.xz
```

## Next Steps After Python is Installed

Once Python is properly installed:

```powershell
# Install conversion tools
pip install tensorflowjs onnx onnx-tf torch

# Then proceed with model conversion
# See: scripts/convert-open-unmix-models.md
```

## Quick Check: Do You Have the Right File?

**Wrong:** `Python-3.12.12.tar.xz` ❌
**Right:** `python-3.12.12-amd64.exe` ✅

The Windows installer should:
- End in `.exe` (not `.tar.xz`)
- Be about 25-30 MB
- Have "amd64" or "win64" in the name


