# Development Guide

## Chrome Extension Development Workflow

This extension uses Vite to build the React app and outputs to the `dist/` folder which is loaded by Chrome.

### Important: Chrome Extension Caching

Chrome extensions don't hot-reload like web apps. Changes require:
1. **Rebuild** the extension (`npm run build`)
2. **Reload** the extension in `chrome://extensions` (click the reload button)
3. **Close all popup windows** completely (not just minimize)
4. **Reopen** the popup window by clicking the extension icon

### Build Commands

- `npm run build` - Build once for production
- `npm run build:watch` - Watch mode that auto-rebuilds on file changes (you still need to manually reload in Chrome)
- `npm run dev` - Development server (for quick UI testing, but won't work as extension)

### Loading the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` folder from this project
5. The extension should appear in your extensions list

### After Making Changes

1. Run `npm run build` (or use watch mode)
2. Go to `chrome://extensions/`
3. Find "uSampler" extension
4. Click the reload button (circular arrow icon)
5. **Close any open popup windows** - this is critical!
6. Click the extension icon to open a fresh popup

### Troubleshooting Changes Not Reflecting

If changes don't appear after reloading:

1. **Verify build completed**: Check `dist/assets/` folder - files should have new timestamps
2. **Check file hashes**: Built JS files have hash suffixes (e.g., `main-ABC123.js`). New builds create new hashes.
3. **Completely close popup**: Right-click extension icon → "Remove from Chrome" then reload, OR close all Chrome windows
4. **Clear extension data**: In `chrome://extensions/`, click "Remove" then "Load unpacked" again
5. **Check console for errors**: Right-click popup → Inspect → Console tab
6. **Service worker cache**: In DevTools → Application → Service Workers, unregister any stale workers
7. **Try incognito mode**: Load extension in incognito to rule out other extensions interfering

### Project Structure

```
usampler/
├── public/              # Extension files (manifest, background, icons)
│   ├── manifest.json
│   ├── background.js
│   └── icon*.png
├── src/
│   ├── core/           # Vanilla JS audio engine (NO React)
│   │   ├── AudioEngine.js
│   │   └── WaveformVisualizer.js
│   ├── context/        # React context wrapper
│   │   └── AudioContext.tsx
│   ├── components/     # React UI components
│   └── utils/          # Utility functions
├── dist/               # Built extension (created by vite build)
└── index.html          # Entry point
```

### Key Architecture Points

- **Core engine is vanilla JS**: `src/core/` files must NOT import React
- **React wraps the engine**: `AudioContext.tsx` bridges React and the vanilla engine
- **Build output**: Vite bundles everything into `dist/assets/` with hashed filenames
- **Extension loads from dist/**: Chrome reads from `dist/`, not `src/`

### Tailwind CSS Configuration

This project uses **Tailwind CSS v4**, which requires a different import syntax:

- **Use**: `@import "tailwindcss";` in `src/index.css`
- **NOT**: `@tailwind base; @tailwind components; @tailwind utilities;` (v3 syntax)

If styles appear as a black/white wireframe, verify:
1. `src/index.css` uses `@import "tailwindcss";`
2. Build output CSS is ~30-40 kB (not ~9 kB)
3. PostCSS config has `@tailwindcss/postcss` plugin installed

### Common Issues

**"Extension won't load"**
- Check `dist/manifest.json` exists
- Verify all icons are in `dist/`
- Check console for manifest errors

**"Changes don't appear"**
- Did you rebuild? (`npm run build`)
- Did you reload extension in chrome://extensions?
- Did you close and reopen the popup?
- Check dist file timestamps match build time

**"UI is black/white wireframe (no styling)"**
- Tailwind CSS not processing - check `src/index.css` uses `@import "tailwindcss";`
- Verify CSS file in `dist/assets/` is ~30-40 kB, not ~9 kB
- Rebuild after fixing CSS syntax

**"Audio not working"**
- Check browser console for errors
- Verify microphone permissions
- Ensure display media picker is selecting audio source

