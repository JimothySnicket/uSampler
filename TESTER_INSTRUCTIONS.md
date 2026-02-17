# uSampler v1.0.0 - Tester Instructions

Thank you for testing uSampler!

## Installation

1. Extract the ZIP to a folder on your computer
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the extracted folder (should contain `manifest.json`)
5. Click the uSampler icon in Chrome's toolbar

## Testing Checklist

### Audio Capture
- [ ] Click "Select Source" and pick a tab playing audio
- [ ] Verify VU meters show audio levels
- [ ] Arm recording and record a sample
- [ ] Verify waveform displays correctly during and after recording
- [ ] Test threshold auto-arm (set threshold, wait for audio to trigger recording)

### Playback
- [ ] Play recorded samples
- [ ] Test pause/resume
- [ ] Test loop toggle
- [ ] Test skip-back
- [ ] Select a region on the waveform and play just that region
- [ ] Adjust volume via the gain fader in the VU panel

### Editing
- [ ] Crop a sample using region selection
- [ ] Normalize a sample
- [ ] Reverse a sample
- [ ] Downsample a sample
- [ ] Bitcrush a sample
- [ ] Adjust 3-band EQ and preview
- [ ] Apply time stretch

### Noise Reduction
- [ ] Enable noise gate
- [ ] Adjust sensitivity and verify effect on audio

### Export
- [ ] Export as WAV (test 16-bit, 24-bit, 32-bit)
- [ ] Export as MP3 (test 128, 192, 256, 320 kbps)
- [ ] Test different sample rate options
- [ ] Crop & Export from crop dialog
- [ ] Export all samples as individual files
- [ ] Export all as ZIP archive

### Sample Management
- [ ] Rename a sample
- [ ] Duplicate a sample
- [ ] Delete a sample
- [ ] Multi-select (Ctrl+Click, Shift+Click)
- [ ] Save session
- [ ] Load session

### Chopping
- [ ] Auto-chop with transient detection
- [ ] Equal-length chop
- [ ] Play individual chops

## Known Limitations
- MP3 encoding is slower than WAV export
- Very long recordings (>10 min) may use significant memory
- Tab audio capture requires the tab to have audible audio
- Source selector pulse animation indicates no source is connected

## Reporting Issues
Please report at https://github.com/JimothySnicket/uSampler/issues with:
1. What you were trying to do
2. What happened instead
3. Any error messages
4. Browser version and OS
