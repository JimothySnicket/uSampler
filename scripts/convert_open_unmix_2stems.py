#!/usr/bin/env python3
"""
Convert Open-Unmix 2-stem PyTorch models to TensorFlow.js format.

This script downloads Open-Unmix 2-stem models and converts them to
TensorFlow.js format for browser use.

Requirements:
    pip install torch openunmix tensorflowjs onnx onnx-tf

Usage:
    python convert_open_unmix_2stems.py
"""

import os
import sys
import torch
import json
from pathlib import Path

try:
    import openunmix
    from openunmix import predict
except ImportError:
    print("Error: openunmix not installed. Install with: pip install openunmix")
    sys.exit(1)

try:
    import tensorflowjs as tfjs
    import tensorflow as tf
except ImportError:
    print("Error: tensorflowjs not installed. Install with: pip install tensorflowjs")
    sys.exit(1)

try:
    import onnx
    from onnx_tf.backend import prepare
except ImportError:
    print("Error: onnx or onnx-tf not installed. Install with: pip install onnx onnx-tf")
    sys.exit(1)


def download_openunmix_model(model_type='umx'):
    """Download Open-Unmix model."""
    print(f"Downloading Open-Unmix {model_type} model...")
    
    # Open-Unmix provides pre-trained models
    # For 2-stem, we need 'umx' model
    model = openunmix.umx(pretrained=True)
    return model


def convert_pytorch_to_onnx(pytorch_model, output_path, stem_name):
    """Convert PyTorch model to ONNX format."""
    print(f"Converting {stem_name} model to ONNX...")
    
    # Create dummy input (Open-Unmix expects [batch, channels, time])
    # Open-Unmix processes at 44.1kHz, uses 4096 FFT window
    dummy_input = torch.randn(1, 2, 44100)  # 1 second of stereo audio
    
    # Export to ONNX
    onnx_path = output_path / f"{stem_name}.onnx"
    torch.onnx.export(
        pytorch_model,
        dummy_input,
        str(onnx_path),
        input_names=['audio'],
        output_names=['output'],
        dynamic_axes={
            'audio': {2: 'time'},
            'output': {2: 'time'}
        },
        opset_version=11
    )
    
    print(f"ONNX model saved to {onnx_path}")
    return onnx_path


def convert_onnx_to_tfjs(onnx_path, output_dir):
    """Convert ONNX model to TensorFlow.js format."""
    print(f"Converting ONNX to TensorFlow.js...")
    
    # Load ONNX model
    onnx_model = onnx.load(str(onnx_path))
    
    # Convert ONNX to TensorFlow
    tf_rep = prepare(onnx_model)
    
    # Save as TensorFlow SavedModel
    saved_model_path = output_dir / "saved_model"
    tf_rep.export_graph(str(saved_model_path))
    
    # Convert SavedModel to TensorFlow.js
    tfjs_path = output_dir / "tfjs_model"
    tfjs.converters.convert_tf_saved_model(
        str(saved_model_path),
        str(tfjs_path)
    )
    
    print(f"TensorFlow.js model saved to {tfjs_path}")
    return tfjs_path


def convert_openunmix_2stems():
    """Main conversion function for 2-stem Open-Unmix model."""
    
    output_base = Path("converted_models/umx-2stems")
    output_base.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("Open-Unmix 2-Stem Model Converter")
    print("=" * 60)
    
    # Open-Unmix 2-stem model has separate models for vocals and accompaniment
    # We need to download and convert each
    
    stems = ['vocals', 'accompaniment']
    
    for stem in stems:
        print(f"\n{'='*60}")
        print(f"Processing {stem} stem...")
        print(f"{'='*60}")
        
        stem_dir = output_base / stem
        stem_dir.mkdir(exist_ok=True)
        
        try:
            # Download model
            # Note: Open-Unmix uses a single model architecture
            # We'll need to use the appropriate target for each stem
            model = openunmix.umx(pretrained=True, target=stem)
            
            # Convert PyTorch -> ONNX
            onnx_path = convert_pytorch_to_onnx(model, stem_dir, stem)
            
            # Convert ONNX -> TensorFlow.js
            tfjs_path = convert_onnx_to_tfjs(onnx_path, stem_dir)
            
            # Move model.json and weights to final location
            model_json = tfjs_path / "model.json"
            if model_json.exists():
                import shutil
                shutil.copy(model_json, stem_dir / "model.json")
                
                # Copy weight files
                for weight_file in tfjs_path.glob("*.bin"):
                    shutil.copy(weight_file, stem_dir / weight_file.name)
                
                print(f"✅ {stem} model converted successfully!")
                print(f"   Model files in: {stem_dir}")
            else:
                print(f"❌ Error: model.json not found in {tfjs_path}")
                
        except Exception as e:
            print(f"❌ Error converting {stem}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    print(f"\n{'='*60}")
    print("Conversion complete!")
    print(f"Models saved to: {output_base}")
    print(f"\nNext steps:")
    print(f"1. Copy models to: public/models/umx-2stems/")
    print(f"2. Structure should be:")
    print(f"   public/models/umx-2stems/vocals/model.json")
    print(f"   public/models/umx-2stems/vocals/weights*.bin")
    print(f"   public/models/umx-2stems/accompaniment/model.json")
    print(f"   public/models/umx-2stems/accompaniment/weights*.bin")
    print(f"{'='*60}")


if __name__ == "__main__":
    try:
        convert_openunmix_2stems()
    except KeyboardInterrupt:
        print("\n\nConversion cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nFatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

