# Chrome Web Store Submission Checklist

## Completed

### Code & Build
- [x] Manifest V3 compliant
- [x] Service worker (no persistent background)
- [x] CSP configured for WebAssembly (`wasm-unsafe-eval`)
- [x] Production build clean (`npm run build`)
- [x] TypeScript type-check passes
- [x] All dead code removed (ADSR, RNNoise, stem sep, premium gating, BPM/key detection)
- [x] Debug logging gated behind DEBUG flag
- [x] No console.log/warn/error in production code (all use logger utility)
- [x] Lossless PCM recording via AudioWorklet (replaced MediaRecorder/Opus)

### Icons
- [x] icon16.png (16x16)
- [x] icon32.png (32x32)
- [x] icon48.png (48x48)
- [x] icon128.png (128x128)

### Permissions (all justified)
- [x] `tabCapture` — audio capture from tabs
- [x] `activeTab` — interact with current tab
- [x] `tabs` — tab management for capture
- [x] `windows` — popup window creation
- [x] `downloads` — export audio files
- [x] `storage` — session/settings persistence

### Documentation
- [x] Privacy Policy (`PRIVACY_POLICY.md`)
- [x] Store Description (`STORE_DESCRIPTION.md`)
- [x] Third-party license attribution (`THIRD_PARTY_LICENSES.md`)
- [x] README (`README.md`)
- [x] `homepage_url` in manifest.json

### Security & Compliance
- [x] `npm audit` — 0 vulnerabilities
- [x] All processing local (no external API calls)
- [x] No user data transmitted externally
- [x] LAME/lamejs LGPL-3.0 attribution included
- [x] All dependency licenses documented

## Remaining (Manual)

### Screenshots
Capture 5 screenshots (1280x800px recommended):
1. Main interface with waveform and transport controls
2. Waveform editing — crop/region selection
3. EQ controls with visual feedback
4. Export dialog with format options
5. Sample management sidebar with multiple samples

### Store Submission
1. ~~Host privacy policy at public URL~~ — GitHub Pages: `https://jimothysnicket.github.io/uSampler/privacy-policy`
   - Enable in repo Settings → Pages → Source: `dev/stem-separation` / `docs`
2. Capture screenshots
3. Submit to Chrome Web Store Developer Dashboard
4. Select category: "Productivity" or "Entertainment"
5. Await review (typically 1-7 days)
