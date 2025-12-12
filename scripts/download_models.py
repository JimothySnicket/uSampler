#!/usr/bin/env python3
"""
Download Open-Unmix model files directly.
No torch import needed - just downloads the .pth files.
"""

import urllib.request
from pathlib import Path
import sys

print("=" * 60)
print("Open-Unmix Model Downloader")
print("=" * 60)

# Open-Unmix 2-stem model URLs
# These are the official pre-trained model weights from Zenodo
MODEL_URLS = {
    'vocals': 'https://zenodo.org/record/3370489/files/umx_vocals.pth?download=1',
    'accompaniment': 'https://zenodo.org/record/3370489/files/umx_accompaniment.pth?download=1'
}

def download_file(url, output_path):
    """Download a file with progress."""
    print(f"\nDownloading: {output_path.name}")
    print(f"From: {url}")
    
    try:
        def show_progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            percent = min(100, (downloaded * 100) // total_size) if total_size > 0 else 0
            print(f"\rProgress: {percent}%", end='', flush=True)
        
        urllib.request.urlretrieve(url, output_path, show_progress)
        print(f"\n✅ Downloaded: {output_path}")
        return True
    except Exception as e:
        print(f"\n❌ Download failed: {e}")
        return False

def main():
    output_dir = Path("downloaded_models")
    output_dir.mkdir(exist_ok=True)
    
    print("\nDownloading Open-Unmix 2-stem models...")
    print("This will download ~100-150 MB total.")
    print()
    
    downloaded = []
    
    for stem, url in MODEL_URLS.items():
        filename = output_dir / f"umx_{stem}.pth"
        
        # Skip if already downloaded
        if filename.exists():
            print(f"\n⚠️  {filename.name} already exists. Skipping download.")
            downloaded.append(filename)
            continue
        
        if download_file(url, filename):
            downloaded.append(filename)
    
    if downloaded:
        print(f"\n{'='*60}")
        print(f"✅ Successfully downloaded {len(downloaded)} model files!")
        print(f"{'='*60}")
        print("\nFiles downloaded to:")
        for f in downloaded:
            print(f"  - {f}")
        print("\nNext steps:")
        print("1. Convert PyTorch models to TensorFlow.js")
        print("2. Use conversion script (requires torch + openunmix)")
        print("\nNote: Conversion requires:")
        print("  - Model architecture (from openunmix package)")
        print("  - Load weights into architecture")
        print("  - Convert PyTorch -> ONNX -> TensorFlow.js")
    else:
        print("\n❌ No models downloaded.")
        print("\nManual download:")
        print("Visit: https://zenodo.org/record/3370489")
        print("Download:")
        print("  - umx_vocals.pth")
        print("  - umx_accompaniment.pth")
        print("\nPlace files in: downloaded_models/")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nDownload cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

