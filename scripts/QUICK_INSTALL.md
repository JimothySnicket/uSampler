# Quick Install Guide - Run These Commands

## Step 1: Open PowerShell

Open a new PowerShell window (anywhere is fine).

## Step 2: Install Conversion Tools

Copy and paste this command:

```powershell
py -m pip install tensorflowjs onnx onnx-tf torch
```

This will install all the tools needed for model conversion. It may take a few minutes.

## Step 3: Verify Installation

After installation completes, verify:

```powershell
py -m pip list | Select-String "tensorflowjs|onnx|torch"
```

You should see:
- tensorflowjs
- onnx
- onnx-tf
- torch

## Step 4: Test TensorFlow.js Converter

```powershell
tensorflowjs_converter --version
```

If this doesn't work, try:
```powershell
py -m tensorflowjs.converters --version
```

## What's Next?

Once tools are installed, you can:
1. Download Open-Unmix models
2. Convert them using the scripts in `scripts/convert-open-unmix-models.md`
3. Or use server-side processing (already implemented)

## Troubleshooting

**If installation fails:**
- Make sure you have internet connection
- Try: `py -m pip install --upgrade pip` first
- Then retry the installation

**If `tensorflowjs_converter` not found:**
- Use `py -m tensorflowjs.converters` instead
- Or add Python Scripts folder to PATH


