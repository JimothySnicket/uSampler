# Quick Start: Model Conversion

## TL;DR - Where to Run Commands

### Python Commands (pip, tensorflowjs_converter)
**Run in:** A **new Command Prompt or PowerShell** window (anywhere)

1. Open **PowerShell** or **Command Prompt** (Windows Key + X, then select)
2. **NOT** in your Node.js project folder - can be anywhere
3. Run Python commands there

### Node.js Commands (npm)
**Run in:** Your project folder
```
C:\Users\Jamie\Documents\Ai Dev Tools\Sampler Extension\Unified Sampler
```

## Example Workflow

### Terminal 1: Python Environment (for conversion)
```powershell
# Open PowerShell anywhere
# Check Python
python --version

# Install tools
pip install tensorflowjs onnx onnx-tf torch

# Navigate to where you'll download models
cd C:\Users\Jamie\Documents
mkdir audio-models
cd audio-models

# Download models (git clone or manual download)
# ... conversion steps ...

# Copy converted files to project
copy /Y "converted\*" "C:\Users\Jamie\Documents\Ai Dev Tools\Sampler Extension\Unified Sampler\public\models\umx-5stems\"
```

### Terminal 2: Node.js Project (for development)
```powershell
# In your project folder
cd "C:\Users\Jamie\Documents\Ai Dev Tools\Sampler Extension\Unified Sampler"

# Run npm commands here
npm install
npm run build
```

## Key Points

- **Python commands** = Any terminal with Python installed
- **npm commands** = In your project folder
- **File operations** = Anywhere, just use correct paths
- **Two separate terminals** = Easiest approach

## Don't Have Python?

1. Download: https://www.python.org/downloads/
2. During install: Check ✅ "Add Python to PATH"
3. Restart terminal after installation
4. Verify: `python --version`


