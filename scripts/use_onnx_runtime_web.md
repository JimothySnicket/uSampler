# Using ONNX Runtime Web Instead of TensorFlow.js

## Why This Approach?

- ✅ **No conversion needed** - Keep models as ONNX
- ✅ **Avoids dependency conflicts** - No ONNX→TF conversion
- ✅ **Runs in browser** - ONNX Runtime Web works directly
- ✅ **Well-supported** - Official Microsoft project

## Steps

### 1. Convert to ONNX Only

```powershell
py -3.12 scripts/convert_to_onnx_only.py
```

This converts PyTorch → ONNX (no TensorFlow.js step needed!)

### 2. Install ONNX Runtime Web

```bash
npm install onnxruntime-web
```

### 3. Update Your Code

Instead of TensorFlow.js, use ONNX Runtime Web:

```typescript
import * as ort from 'onnxruntime-web';

// Load model
const session = await ort.InferenceSession.create('/models/umx-2stems/vocals/vocals.onnx');

// Run inference
const feeds = { magnitude_spectrogram: inputTensor };
const results = await session.run(feeds);
const mask = results.mask;
```

### 4. Update stemSeparator.ts

Replace TensorFlow.js code with ONNX Runtime Web:

```typescript
// Instead of:
const tf = await import('@tensorflow/tfjs');
const model = await tf.loadLayersModel(modelPath);

// Use:
import * as ort from 'onnxruntime-web';
const session = await ort.InferenceSession.create(modelPath);
const results = await session.run({ magnitude_spectrogram: inputTensor });
```

## Benefits

- Simpler conversion (one step instead of three)
- No dependency conflicts
- Models stay in ONNX format
- Works in browser

## Trade-offs

- Need to update code to use ONNX Runtime Web
- Different API than TensorFlow.js
- But simpler overall!

## Recommendation

This is actually **easier** than TensorFlow.js conversion!
Try this approach first.

