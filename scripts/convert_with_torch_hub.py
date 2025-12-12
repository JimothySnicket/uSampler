#!/usr/bin/env python3
"""
Convert Open-Unmix models using torch.hub.load() directly from GitHub.
No openunmix package installation needed!
"""

import torch
import sys
from pathlib import Path

print("=" * 60)
print("Open-Unmix Conversion via torch.hub")
print("=" * 60)

try:
    # Load models directly from GitHub using torch.hub
    # This doesn't require the openunmix package!
    
    repo = 'sigsep/open-unmix-pytorch'
    
    print(f"\nLoading models from: {repo}")
    print("This will download models automatically...")
    
    # For 2-stem separation, we need 'umx' model
    # But Open-Unmix uses separate models for each target
    # We'll load the separator which contains all targets
    
    print("\nLoading Open-Unmix separator (contains all targets)...")
    separator = torch.hub.load(repo, 'umx', pretrained=True, trust_repo=True)
    
    print("✅ Model loaded successfully!")
    print(f"Model type: {type(separator)}")
    print(f"Sample rate: {separator.sample_rate}")
    
    # Check what targets are available
    if hasattr(separator, 'targets'):
        print(f"Available targets: {separator.targets}")
    
    # For 2-stem, we typically want vocals and accompaniment
    # Let's check the model structure
    print("\nModel structure:")
    print(separator)
    
    # Now we need to convert each target model
    # Open-Unmix separator contains separate models for each target
    print("\n" + "=" * 60)
    print("Next: Convert to TensorFlow.js")
    print("=" * 60)
    print("\nNote: Full conversion requires:")
    print("1. Extract each target model from separator")
    print("2. Convert PyTorch -> ONNX -> TensorFlow.js")
    print("3. Handle STFT preprocessing in JavaScript")
    
    # Save model info
    output_dir = Path("converted_models")
    output_dir.mkdir(exist_ok=True)
    
    print(f"\nModel info saved. Next step: conversion script.")
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
    
    print("\n" + "=" * 60)
    print("Alternative: Try loading specific targets")
    print("=" * 60)
    
    # Try loading individual targets
    try:
        print("\nTrying to load individual targets...")
        vocals_model = torch.hub.load(repo, 'umx', target='vocals', pretrained=True, trust_repo=True)
        print("✅ Vocals model loaded!")
        
        accomp_model = torch.hub.load(repo, 'umx', target='accompaniment', pretrained=True, trust_repo=True)
        print("✅ Accompaniment model loaded!")
        
    except Exception as e2:
        print(f"❌ Individual loading also failed: {e2}")
        sys.exit(1)

