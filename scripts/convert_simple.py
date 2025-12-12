#!/usr/bin/env python3
"""
Simplified Open-Unmix conversion script.
Downloads models using torch.hub (no openunmix package needed).
"""

import torch
import sys
from pathlib import Path

print("=" * 60)
print("Open-Unmix Model Downloader")
print("=" * 60)

try:
    # Download Open-Unmix models using torch.hub
    # Open-Unmix models are available via torch.hub
    
    print("\nDownloading Open-Unmix 2-stem models...")
    print("This will download ~100-150 MB of model files.")
    
    # Try to download using torch.hub
    # Open-Unmix repo: sigsep/open-unmix-pytorch
    model_url = "sigsep/open-unmix"
    
    print(f"\nAttempting to load model from: {model_url}")
    
    # For 2-stem, we need vocals and accompaniment models
    stems = ['vocals', 'accompaniment']
    
    models = {}
    for stem in stems:
        try:
            print(f"\nDownloading {stem} model...")
            # Load model using torch.hub
            model = torch.hub.load(model_url, 'umx', target=stem, pretrained=True)
            models[stem] = model
            print(f"✅ {stem} model downloaded successfully!")
        except Exception as e:
            print(f"❌ Error downloading {stem}: {e}")
            print("\nTrying alternative method...")
            # Alternative: direct download
            try:
                import urllib.request
                # Open-Unmix models are hosted on Zenodo
                # We'll need to construct the download URL
                print("Note: Manual download may be required.")
                print(f"Visit: https://github.com/sigsep/open-unmix-pytorch")
                print(f"Download models for: {stem}")
            except:
                pass
    
    if models:
        print(f"\n✅ Successfully downloaded {len(models)} models!")
        print("\nNext step: Convert PyTorch -> TensorFlow.js")
        print("Models are loaded in memory. Use torch.onnx.export() to convert.")
    else:
        print("\n❌ Could not download models automatically.")
        print("\nManual steps:")
        print("1. Visit: https://github.com/sigsep/open-unmix-pytorch")
        print("2. Download pre-trained model files (.pth)")
        print("3. Place in: models/ directory")
        print("4. Run conversion script")
        
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

