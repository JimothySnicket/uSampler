# uSampler

Professional-grade audio sampling workstation as a Chrome extension. Capture lossless audio from any browser tab, edit with precision, and export in WAV or MP3.

This replaces $70+ audio capture software. All processing happens locally -- your samples never touch a server.

## Features

- **Lossless capture** -- AudioWorklet-based PCM recording at native sample rate (no Opus/lossy encoding)
- **Waveform editing** -- crop, normalize, reverse, downsample, bitcrush with visual region selection
- **3-band parametric EQ** with live visualization
- **Spectral noise gate** for noise reduction
- **Time stretching**
- **Transient detection** and automatic sample chopping
- **WAV export** (16/24/32-bit) and **MP3 export** (128-320 kbps)
- **Session save/load** (ZIP-based)
- **Sample management** -- rename, duplicate, delete, multi-select

## Install

### From Chrome Web Store
[Install from Chrome Web Store](https://chromewebstore.google.com/detail/usampler/aloekkflidfdkcojjankhggdldjlbfem)

### From Source
```bash
npm install
npm run build
```
Then load `dist/` as an unpacked extension at `chrome://extensions/` (Developer mode).

## Build Commands

```bash
npm run build          # Production build (type-checks first)
npm run build:watch    # Watch mode -- auto-rebuilds on changes
npm run type-check     # TypeScript checking only
npm run dev            # Vite dev server (UI testing, won't work as extension)
```

## Tech Stack

- React 19, TypeScript, Vite 6, Tailwind CSS v4
- Vanilla JS audio core (Web Audio API) -- no framework dependency
- AudioWorklet for lossless PCM capture
- lamejs for MP3 encoding
- JSZip for session export
- Zustand for state management

## Architecture

The audio engine (`src/core/AudioEngine.js`) is pure vanilla JavaScript with no framework imports. React wraps it via Context (`src/context/AudioContext.tsx`). This separation keeps the audio core portable and testable.

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## Permissions

| Permission | Why |
|-----------|-----|
| `tabCapture` | Capture audio from browser tabs |
| `activeTab` | Interact with the current tab |
| `windows` | Open popup window |
| `downloads` | Save exported audio files |
| `storage` | Persist sessions and settings |

## Third-Party Licenses

See [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) for full attribution.

MP3 encoding uses **LAME** (via lamejs) under LGPL-3.0. See https://lame.sourceforge.net

## Support

- Issues & feature requests: https://github.com/JimothySnicket/uSampler/issues
- Support development: https://ko-fi.com/W7W51UG11V

## License

All rights reserved.
