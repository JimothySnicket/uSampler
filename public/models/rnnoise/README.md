# RNNoise Model Files

This directory should contain RNNoise WebAssembly files for browser-based noise reduction.

## Required Files

- `rnnoise.wasm` - RNNoise WebAssembly module (~1MB)
- `rnnoise.model` - Trained model file (~100KB)

## Getting RNNoise Files

RNNoise is developed by Xiph.org and released under BSD license (commercial use allowed).

### Option 1: Build from Source

1. Clone RNNoise repository: https://github.com/xiph/rnnoise
2. Compile to WebAssembly using Emscripten
3. Place compiled files in this directory

### Option 2: Use Pre-built WASM

Look for JavaScript/TypeScript wrappers that include pre-built WASM:
- Search npm for "rnnoise" packages
- Check for browser-compatible WASM builds

## License

RNNoise is released under the BSD License - commercial use allowed.

## Fallback

If RNNoise files are not available, the system will automatically fall back to spectral gating noise reduction, which works well for general noise reduction.


