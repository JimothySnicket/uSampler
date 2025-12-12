#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convert Open-Unmix models to ONNX format only.
Then use ONNX Runtime Web in browser (no TensorFlow.js needed!)
"""

import torch
import sys
import os
from pathlib import Path

# Fix Windows encoding
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'

print("=" * 60)
print("Open-Unmix to ONNX Converter")
print("=" * 60)
print("\nThis converts models to ONNX format.")
print("Then use ONNX Runtime Web in browser - no TensorFlow.js needed!")
print()

# Load models using torch.hub
repo = 'sigsep/open-unmix-pytorch'
print(f"Loading models from: {repo}")

try:
    separator = torch.hub.load(repo, 'umx', pretrained=True, trust_repo=True)
    separator.eval()
    print("[OK] Models loaded!")
except Exception as e:
    print(f"[ERROR] Error loading models: {e}")
    sys.exit(1)

output_base = Path("converted_models/umx-onnx")
output_base.mkdir(parents=True, exist_ok=True)

# For 2-stem, convert vocals and create accompaniment
stems_to_convert = {
    'vocals': separator.target_models['vocals'],
}

print(f"\n{'='*60}")
print("Converting to ONNX...")
print(f"{'='*60}")

onnx_models = {}

for stem_name, model in stems_to_convert.items():
    print(f"\nConverting {stem_name}...")
    
    stem_dir = output_base / stem_name
    stem_dir.mkdir(exist_ok=True)
    
    # Open-Unmix model expects 4D input: [batch, channels, freq_bins, time_frames]
    # Based on model structure, it processes spectrograms
    # For STFT with 4096 FFT: freq_bins = 2049, time varies
    # But the model actually reshapes internally, so let's use the expected input
    # The model's fc1 expects 2974 features, which comes from reshaping
    # Let's trace through: 2 channels * 2049 freq * some time = features
    # Actually, let's use the separator's expected input format
    # Open-Unmix separator expects [channels, samples] audio input
    # But the individual model expects processed spectrogram
    # Let's use a shape that matches what the model processes internally
    dummy_input = torch.randn(1, 2, 2049, 10)  # [batch, channels, freq, time]
    
    onnx_path = stem_dir / f"{stem_name}.onnx"
    
    try:
        torch.onnx.export(
            model,
            dummy_input,
            str(onnx_path),
            input_names=['magnitude_spectrogram'],
            output_names=['mask'],
            dynamic_axes={
                'magnitude_spectrogram': {0: 'batch', 1: 'features'},
                'mask': {0: 'batch', 1: 'features'}
            },
            opset_version=11,
            do_constant_folding=True
        )
        
        print(f"[OK] ONNX model saved: {onnx_path}")
        onnx_models[stem_name] = onnx_path
        
    except Exception as e:
        print(f"[ERROR] Error converting {stem_name}: {e}")
        import traceback
        traceback.print_exc()
        continue

if onnx_models:
    print(f"\n{'='*60}")
    print("[OK] Conversion Complete!")
    print(f"{'='*60}")
    print(f"\nONNX models saved to: {output_base}")
    print("\nNext steps:")
    print("1. Use ONNX Runtime Web in browser")
    print("2. Load models with: ort.InferenceSession.create()")
    print("3. No TensorFlow.js conversion needed!")
    print("\nExample:")
    print("  import * as ort from 'onnxruntime-web';")
    print("  const session = await ort.InferenceSession.create('vocals.onnx');")
    print(f"{'='*60}")
else:
    print("\n[ERROR] No models converted.")

