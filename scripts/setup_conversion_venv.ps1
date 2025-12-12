# PowerShell script to create virtual environment for model conversion
# Run with: .\scripts\setup_conversion_venv.ps1

Write-Host "=" -NoNewline
Write-Host ("=" * 59)
Write-Host "Open-Unmix Conversion Virtual Environment Setup"
Write-Host ("=" * 60)
Write-Host ""

# Check Python 3.12
Write-Host "Checking Python 3.12..."
$pythonVersion = py -3.12 --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Python 3.12 not found!" -ForegroundColor Red
    Write-Host "Please install Python 3.12 first."
    exit 1
}
Write-Host "✅ $pythonVersion" -ForegroundColor Green
Write-Host ""

# Create virtual environment
$venvPath = "venv_conversion"
if (Test-Path $venvPath) {
    Write-Host "⚠️  Virtual environment already exists at: $venvPath"
    $response = Read-Host "Remove and recreate? (y/n)"
    if ($response -eq "y") {
        Remove-Item -Recurse -Force $venvPath
        Write-Host "Removed existing virtual environment."
    } else {
        Write-Host "Using existing virtual environment."
        Write-Host ""
        Write-Host "To activate: .\venv_conversion\Scripts\Activate.ps1"
        Write-Host "To run conversion: .\venv_conversion\Scripts\python.exe scripts\convert_umx_to_tfjs.py"
        exit 0
    }
}

Write-Host "Creating virtual environment..."
py -3.12 -m venv $venvPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create virtual environment!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Virtual environment created!" -ForegroundColor Green
Write-Host ""

# Activate and install packages
Write-Host "Installing packages with compatible versions..."
Write-Host ""

$activateScript = "$venvPath\Scripts\Activate.ps1"
& $activateScript

# Install packages one by one with specific versions for compatibility
Write-Host "Installing torch..."
& "$venvPath\Scripts\python.exe" -m pip install --quiet --upgrade pip
& "$venvPath\Scripts\python.exe" -m pip install --quiet torch torchaudio

Write-Host "Installing tensorflow and tensorflowjs..."
& "$venvPath\Scripts\python.exe" -m pip install --quiet tensorflow
& "$venvPath\Scripts\python.exe" -m pip install --quiet tensorflowjs --no-deps
& "$venvPath\Scripts\python.exe" -m pip install --quiet tf-keras

Write-Host "Installing ONNX tools (pre-built wheels)..."
# Use pre-built ONNX wheel, don't build from source
& "$venvPath\Scripts\python.exe" -m pip install --quiet --only-binary=all onnx
& "$venvPath\Scripts\python.exe" -m pip install --quiet onnx2tf

Write-Host ""
Write-Host ("=" * 60)
Write-Host "✅ Setup Complete!"
Write-Host ("=" * 60)
Write-Host ""
Write-Host "To use the virtual environment:"
Write-Host "  .\venv_conversion\Scripts\Activate.ps1"
Write-Host ""
Write-Host "To run conversion:"
Write-Host "  .\venv_conversion\Scripts\python.exe scripts\convert_umx_to_tfjs.py"
Write-Host ""
Write-Host "Or activate first, then run:"
Write-Host "  .\venv_conversion\Scripts\Activate.ps1"
Write-Host "  python scripts\convert_umx_to_tfjs.py"
Write-Host ""

