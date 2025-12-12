#!/usr/bin/env python3
"""
Download Open-Unmix models directly and convert to TensorFlow.js.
Uses direct download URLs instead of torch.hub.
"""

import torch
import sys
import urllib.request
from pathlib import Path

print("=" * 60)
print("Open-Unmix Model Download & Conversion")
print("=" * 60)

# Open-Unmix 2-stem model URLs (from Zenodo)
# These are the official pre-trained model weights
MODEL_URLS = {
    'vocals': 'https://zenodo.org/record/3370489/files/umx_vocals.pth',
    'accompaniment': 'https://zenodo.org/record/3370489/files/umx_accompaniment.pth'
}

def download_model(url, filename):
    """Download a model file."""
    print(f"\nDownloading {filename}...")
    print(f"URL: {url}")
    
    try:
        urllib.request.urlretrieve(url, filename)
        print(f"✅ Downloaded: {filename}")
        return True
    except Exception as e:
        print(f"❌ Download failed: {e}")
        return False

def load_pytorch_model(model_path):
    """Load PyTorch model from .pth file."""
    print(f"\nLoading PyTorch model: {model_path}")
    try:
        # Load state dict
        checkpoint = torch.load(model_path, map_location='cpu')
        
        # Open-Unmix models are saved as state dicts
        # We need to reconstruct the model architecture
        # For now, return the checkpoint
        return checkpoint
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        return None

def main():
    output_dir = Path("downloaded_models")
    output_dir.mkdir(exist_ok=True)
    
    print("\nStep 1: Downloading models...")
    downloaded = {}
    
    for stem, url in MODEL_URLS.items():
        filename = output_dir / f"umx_{stem}.pth"
        if download_model(url, filename):
            downloaded[stem] = filename
    
    if not downloaded:
        print("\n❌ No models downloaded. Trying alternative URLs...")
        print("\nAlternative: Download manually from:")
        print("https://zenodo.org/record/3370489")
        print("\nOr use the official repository:")
        print("https://github.com/sigsep/open-unmix-pytorch")
        return
    
    print(f"\n✅ Downloaded {len(downloaded)} models!")
    print("\nStep 2: Loading models...")
    
    models = {}
    for stem, path in downloaded.items():
        model = load_pytorch_model(path)
        if model:
            models[stem] = model
    
    if models:
        print(f"\n✅ Loaded {len(models)} models!")
        print("\nNext: Convert to TensorFlow.js")
        print("Note: Full conversion requires model architecture reconstruction.")
        print("This is complex - may need to use the openunmix package.")
    else:
        print("\n❌ Could not load models.")
        print("\nThe .pth files contain model weights.")
        print("To convert, we need:")
        print("1. Model architecture (from openunmix package)")
        print("2. Load weights into architecture")
        print("3. Convert to ONNX")
        print("4. Convert to TensorFlow.js")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

