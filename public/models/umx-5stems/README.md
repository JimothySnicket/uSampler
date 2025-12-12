# Open-Unmix 5stems Model

This directory should contain the Open-Unmix 5stems model files converted to TensorFlow.js format.

## Required Files

- `model.json` - Model architecture file
- `vocals.bin` - Vocals stem model weights
- `drums.bin` - Drums stem model weights  
- `bass.bin` - Bass stem model weights
- `piano.bin` - Piano stem model weights
- `other.bin` - Other instruments stem model weights

## Model Conversion

To convert Open-Unmix PyTorch models to TensorFlow.js:

1. Install tensorflowjs: `pip install tensorflowjs`
2. Convert PyTorch model to ONNX, then to TensorFlow.js
3. Place all files in this directory

## Model Sources

- Official Open-Unmix repository: https://github.com/sigsep/open-unmix-pytorch
- Pre-trained models: https://github.com/sigsep/open-unmix-pytorch#pretrained-models

## License

Open-Unmix models are released under the MIT License - commercial use allowed.


