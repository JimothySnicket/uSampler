# Web Demo Inspection Findings

## Demo URL
https://sigsep.github.io/open-unmix-js/

## What I Found

1. **Demo loads from**: `https://sigsep.github.io/open-unmix-js/`
2. **JavaScript files**:
   - `app.b61426eb.js` - Main application
   - `chunk-vendors.02adbd9b.js` - Vendor libraries
3. **Models likely load dynamically** when you use the demo

## Next Steps

1. **Check the GitHub repository**: https://github.com/sigsep/open-unmix-js
   - Look for model files
   - Check how models are structured
   - See if models are in releases or main branch

2. **Inspect JavaScript bundle**:
   - Models might be embedded
   - Or loaded from CDN
   - Or in separate files

3. **Check repository structure**:
   - Look for `models/` directory
   - Check for `model.json` files
   - See conversion scripts

## Alternative: Virtual Environment

Since we couldn't find pre-converted models easily, I've created:
- `scripts/setup_conversion_venv.ps1` - Sets up virtual environment with compatible versions

This should resolve the dependency conflicts we encountered!

