# uSampler v1.0.0 - Beta Tester Instructions

Thank you for testing uSampler! This document will guide you through installation and testing.

## Installation

### Step 1: Download the Extension
1. You should have received a ZIP file named `uSampler-v1.0.0.zip`
2. Extract the ZIP file to a folder on your computer (e.g., `C:\Users\YourName\Desktop\uSampler-v1.0.0\`)

### Step 2: Load in Chrome
1. Open Google Chrome browser
2. Navigate to `chrome://extensions/` (paste into address bar)
3. Enable **"Developer mode"** (toggle in top-right corner)
4. Click **"Load unpacked"** button
5. Select the folder containing the extracted files (should contain `manifest.json`, `index.html`, etc.)
6. The extension should now appear in your extensions list

### Step 3: Open uSampler
1. Click the uSampler icon in Chrome's toolbar (top-right area)
2. The extension window should open

## Testing Checklist

### Core Functionality

#### Audio Recording
- [ ] **Tab Recording**: Click "Record Tab" and select a browser tab with audio (YouTube, Spotify, etc.)
- [ ] **Microphone Recording**: Click "Record Mic" and grant microphone permission
- [ ] **System Audio**: Click "Record System" and select an application window
- [ ] Verify recording starts and stops properly
- [ ] Check that waveform displays correctly during recording

#### Playback
- [ ] Play recorded samples using the play button
- [ ] Test pause/resume functionality
- [ ] Try looping playback
- [ ] Adjust playback speed/time stretch
- [ ] Test region selection and playback

#### Waveform Editing
- [ ] Crop/trim audio by selecting a region and using crop
- [ ] Adjust start/end points by dragging region handles
- [ ] Test zoom functionality on waveform

#### Effects Processing
- [ ] **EQ**: Adjust low, mid, high bands and verify sound changes
- [ ] **Noise Reduction**: Enable noise gate and adjust sensitivity/amount
- [ ] **Time Stretch**: Adjust time stretch ratio and preview

#### Export
- [ ] Export single sample as WAV
- [ ] Export single sample as MP3 (test different bitrates: 128, 192, 256, 320 kbps)
- [ ] Export all samples as individual files
- [ ] Export all samples as ZIP archive (check the checkbox)
- [ ] Verify files save to `Downloads/uSampler/` folder
- [ ] Test export with different sample rates (44.1 kHz, 48 kHz)

#### Sample Management
- [ ] Rename samples
- [ ] Duplicate samples
- [ ] Delete samples
- [ ] Test multi-select (Ctrl+Click, Shift+Click)
- [ ] Save multiple selected samples at once

#### Chopping (if available)
- [ ] Create chops from a sample
- [ ] Play individual chops
- [ ] Export individual chops

## Known Issues / Limitations

- MP3 encoding may be slower than WAV export
- Very long recordings (>10 minutes) may cause performance issues
- Browser tab audio capture requires the tab to be audible (not muted)
- System audio capture only works on Windows/Mac (not Linux)

## Feedback

Please report any issues you encounter:
1. What were you trying to do?
2. What happened instead?
3. Any error messages?
4. Browser version (Chrome XX.XX)
5. Operating system

## Version Information

- **Version**: 1.0.0
- **Build Date**: [Date will be added]
- **Chrome Version**: Compatible with Chrome 90+

## Troubleshooting

### Extension won't load
- Ensure Developer mode is enabled
- Check that you selected the folder containing `manifest.json`, not the parent folder
- Try removing any existing version first, then reload

### Audio recording not working
- Check browser permissions (microphone/system audio)
- Ensure the source (tab/mic/app) is not muted
- Try refreshing the extension (reload in chrome://extensions/)

### Export not working
- Check that Chrome has permission to download files
- Ensure sufficient disk space
- Check browser console for errors (F12 → Console tab)

### Performance issues
- Close other browser tabs
- Try with shorter recordings first
- Check system resources (CPU/Memory)

## Thank You!

Your feedback is invaluable in making uSampler better. Happy testing!

