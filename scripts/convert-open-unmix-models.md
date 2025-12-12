# Converting Open-Unmix Models to TensorFlow.js

This guide explains how to convert Open-Unmix PyTorch models to TensorFlow.js format for browser use.

## Prerequisites

1. Python 3.7+ with pip
2. PyTorch installed
3. TensorFlow.js converter installed

## Step 1: Install Required Tools

**Where to run:** Open a **new Command Prompt or PowerShell** (anywhere, not in your Node.js project folder)

```powershell
# Install TensorFlow.js converter
pip install tensorflowjs

# Install Open-Unmix dependencies
pip install openunmix onnx onnx-tf torch

# If pip is not recognized, install Python first from python.org
# Make sure to check "Add Python to PATH" during installation
```

## Step 2: Download Open-Unmix Models

**Where to run:** In any folder where you want to store the models (e.g., `C:\Users\Jamie\Documents\models\`)

The pre-trained models can be downloaded from:
- Official repository: https://github.com/sigsep/open-unmix-pytorch
- Model hub: https://github.com/sigsep/open-unmix-pytorch#pretrained-models

For 5stems model:
```powershell
# Option 1: Clone the repository (if you have git)
git clone https://github.com/sigsep/open-unmix-pytorch.git
cd open-unmix-pytorch

# Option 2: Download models manually from the GitHub releases page
# Visit: https://github.com/sigsep/open-unmix-pytorch/releases
# Download the pre-trained model files (.pth files)
```

## Step 3: Convert PyTorch to ONNX (Intermediate Step)

**Where to run:** In the same Python environment where you installed the tools

Since TensorFlow.js converter doesn't directly support PyTorch, we need to convert to ONNX first:

```powershell
# Install ONNX exporter (if not already installed)
pip install onnx onnx-tf

# Convert PyTorch model to ONNX
# You'll need a Python script to do this conversion
# See: https://github.com/sigsep/open-unmix-pytorch for conversion scripts
# Or use the provided convert_open_unmix.py helper script
```

## Step 4: Convert ONNX to TensorFlow.js

**Where to run:** In the same Python environment, navigate to where your ONNX model is

```powershell
# Convert ONNX model to TensorFlow SavedModel
onnx-tf convert -i model.onnx -o tf_saved_model

# Convert TensorFlow SavedModel to TensorFlow.js
# Note: Update the path to your actual project folder
tensorflowjs_converter `
    --input_format=tf_saved_model `
    --output_format=tfjs_graph_model `
    --quantize_float16 `
    tf_saved_model `
    "C:\Users\Jamie\Documents\Ai Dev Tools\Sampler Extension\Unified Sampler\public\models\umx-5stems\"
```

**PowerShell Note:** Use backticks (`) for line continuation in PowerShell, or put everything on one line.

## Alternative: Use Pre-converted Models

Check if there are pre-converted TensorFlow.js models available:
- Search GitHub for "open-unmix tensorflow.js"
- Check TensorFlow.js model hub
- Look for community conversions

## Step 5: Verify Model Files

**Where to check:** In your project folder: `public/models/umx-5stems/`

After conversion, you should have:
- `model.json` - Model architecture
- `model.weights.bin` or multiple `.bin` files - Model weights

If files weren't copied automatically, manually copy them to:
```
C:\Users\Jamie\Documents\Ai Dev Tools\Sampler Extension\Unified Sampler\public\models\umx-5stems\
```

## Note

The conversion process can be complex. Consider:
1. Using a pre-converted model if available
2. Starting with a simpler 2stems model for testing
3. Using server-side processing as an alternative

