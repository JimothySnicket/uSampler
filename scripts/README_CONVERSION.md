# Model Conversion Guide

## Two Approaches

### Approach 1: Use Pre-Converted Models (Fastest)

**Check the open-unmix-js repository:**
- Repository: https://github.com/sigsep/open-unmix-js
- Demo: https://sigsep.github.io/open-unmix-js/
- Models might be in the repo or releases

**If found:**
1. Download model files
2. Place in `public/models/umx-2stems/`
3. Done!

### Approach 2: Convert Ourselves (More Control)

**Setup virtual environment:**
```powershell
.\scripts\setup_conversion_venv.ps1
```

**Run conversion:**
```powershell
.\venv_conversion\Scripts\Activate.ps1
python scripts\convert_umx_to_tfjs.py
```

**Copy models:**
```powershell
# After conversion completes
copy converted_models\umx-2stems\* public\models\umx-2stems\ -Recurse
```

## Current Status

- ✅ Models downloaded (PyTorch format)
- ✅ Conversion scripts created
- ✅ Virtual environment script created
- ⏳ Need to either:
  - Find pre-converted models, OR
  - Run conversion with fixed dependencies

## Recommendation

**Try Approach 1 first** - Check the open-unmix-js repo for models.
If not found, use Approach 2 with the virtual environment.

