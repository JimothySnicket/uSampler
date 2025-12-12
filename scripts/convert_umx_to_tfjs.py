#!/usr/bin/env python3
"""
Full conversion: Open-Unmix PyTorch -> TensorFlow.js
Uses torch.hub to load models, then converts to TF.js format.
"""

import torch
import torch.onnx
import sys
from pathlib import Path

try:
    import onnx
    import onnx2tf
except ImportError:
    print("Installing onnx and onnx2tf...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "onnx", "onnx2tf", "--quiet"])
    import onnx
    import onnx2tf

try:
    import tensorflowjs as tfjs
except ImportError:
    print("tensorflowjs already installed")

print("=" * 60)
print("Open-Unmix to TensorFlow.js Converter")
print("=" * 60)

# Load models using torch.hub
repo = 'sigsep/open-unmix-pytorch'
print(f"\nLoading models from: {repo}")

separator = torch.hub.load(repo, 'umx', pretrained=True, trust_repo=True)
separator.eval()

print("✅ Models loaded!")

# For 2-stem, we need vocals and accompaniment
# Accompaniment = drums + bass + other combined
# But Open-Unmix provides separate models, so we'll convert vocals
# and create accompaniment by combining others

output_base = Path("converted_models/umx-2stems")
output_base.mkdir(parents=True, exist_ok=True)

stems_to_convert = {
    'vocals': separator.target_models['vocals'],
    # For accompaniment, we'll need to handle this differently
    # For now, let's convert vocals and other separately
}

print(f"\n{'='*60}")
print("Converting models to ONNX...")
print(f"{'='*60}")

# Convert each model to ONNX
onnx_models = {}

for stem_name, model in stems_to_convert.items():
    print(f"\nConverting {stem_name}...")
    
    stem_dir = output_base / stem_name
    stem_dir.mkdir(exist_ok=True)
    
    # Open-Unmix expects spectrogram input
    # Input shape: [batch, channels, freq_bins, time_frames]
    # For STFT with 4096 FFT size: freq_bins = 2049, time_frames varies
    # But the model actually expects flattened input after complex norm
    # Based on model structure: fc1 input is 2974 features
    
    # Create dummy input matching the model's expected input
    # The model expects magnitude spectrogram features
    dummy_input = torch.randn(1, 2974)  # Batch size 1, feature dimension
    
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
        
        print(f"✅ ONNX model saved: {onnx_path}")
        onnx_models[stem_name] = onnx_path
        
    except Exception as e:
        print(f"❌ Error converting {stem_name} to ONNX: {e}")
        import traceback
        traceback.print_exc()
        continue

if not onnx_models:
    print("\n❌ No models converted to ONNX. Cannot proceed.")
    sys.exit(1)

print(f"\n{'='*60}")
print("Converting ONNX to TensorFlow.js...")
print(f"{'='*60}")

# Convert ONNX to TensorFlow.js
for stem_name, onnx_path in onnx_models.items():
    print(f"\nConverting {stem_name} ONNX -> TensorFlow.js...")
    
    stem_dir = output_base / stem_name
    
    try:
        # Convert ONNX to TensorFlow SavedModel using onnx2tf
        print("  Converting ONNX -> TensorFlow...")
        saved_model_path = stem_dir / "saved_model"
        
        # Use onnx2tf to convert
        onnx2tf.convert(
            input_onnx_file_path=str(onnx_path),
            output_folder_path=str(saved_model_path),
            copy_onnx_input_output_names_to_tflite=True
        )
        print(f"  ✅ TensorFlow SavedModel: {saved_model_path}")
        
        # Convert TensorFlow SavedModel to TensorFlow.js
        print("  Converting TensorFlow -> TensorFlow.js...")
        tfjs_path = stem_dir / "tfjs_model"
        
        tfjs.converters.convert_tf_saved_model(
            str(saved_model_path),
            str(tfjs_path)
        )
        
        print(f"  ✅ TensorFlow.js model: {tfjs_path}")
        
        # Move model.json and weights to final location
        import shutil
        model_json = tfjs_path / "model.json"
        if model_json.exists():
            shutil.copy(model_json, stem_dir / "model.json")
            print(f"  ✅ Copied model.json")
            
            # Copy weight files
            weight_count = 0
            for weight_file in tfjs_path.glob("*.bin"):
                shutil.copy(weight_file, stem_dir / weight_file.name)
                weight_count += 1
            
            print(f"  ✅ Copied {weight_count} weight file(s)")
            
        print(f"\n✅ {stem_name} conversion complete!")
        print(f"   Files in: {stem_dir}")
        
    except Exception as e:
        print(f"❌ Error converting {stem_name}: {e}")
        import traceback
        traceback.print_exc()
        continue

print(f"\n{'='*60}")
print("Conversion Summary")
print(f"{'='*60}")
print(f"\nModels converted to: {output_base}")
print("\nNext steps:")
print("1. Copy models to: public/models/umx-2stems/")
print("2. Structure:")
print("   public/models/umx-2stems/vocals/model.json")
print("   public/models/umx-2stems/vocals/weights*.bin")
print("\nNote: For 2-stem separation, you may need to:")
print("- Convert 'other' model as accompaniment")
print("- Or combine drums+bass+other models")
print(f"{'='*60}")

