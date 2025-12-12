# Model Size Reality Check

## Open-Unmix Model Sizes (Typical)

Based on standard Open-Unmix models:

- **2stems (vocals/instrumental)**: ~100-150 MB total
- **4stems (vocals/drums/bass/other)**: ~200-400 MB total  
- **5stems (adds piano)**: ~250-500 MB total

These are **per model** sizes. Each stem requires its own model file.

## Browser Bundle Considerations

For a Chrome extension:
- **Extension size limits**: Usually 100-200 MB max
- **User download**: Large models = slow installs
- **Memory usage**: Models load into RAM

## Options

### Option 1: 2-Stem Model (Vocals/Instrumental)
- **Size**: ~100-150 MB
- **Pros**: Smaller, simpler, most common use case
- **Cons**: Less granular separation

### Option 2: Lazy Load Models
- Don't bundle models in extension
- Download models on first use
- Cache locally
- **Pros**: Smaller extension size
- **Cons**: Requires internet on first use

### Option 3: Simplified Separation
- Use spectral/FFT-based separation (no ML)
- **Size**: ~0 MB (algorithm only)
- **Pros**: Tiny, instant
- **Cons**: Lower quality, simpler separation

## Recommendation

If you want **truly lightweight**:
- **2-stem model** (~100-150 MB) with lazy loading
- Or **no ML models** - use spectral separation algorithms

If you need **quality**:
- Accept larger model sizes
- Use 4-stem or 5-stem models
- Implement lazy loading

## Next Steps

1. Decide: Quality vs. Size tradeoff
2. If size matters: Use 2-stem or spectral separation
3. If quality matters: Use 4/5-stem with lazy loading

