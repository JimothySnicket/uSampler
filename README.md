# uSampler

A professional-grade browser extension sampler UI with waveform editing, transport controls, and effects processing.

## Features

- High-fidelity audio sampling from browser tabs
- Waveform visualization and editing
- Transport controls for playback
- Effects processing
- Export functionality

## Installation

### Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder from this project

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development instructions.

## Build Commands

- `npm run dev` - Development server
- `npm run build` - Build for production
- `npm run build:watch` - Watch mode for development
- `npm run type-check` - TypeScript type checking
- `npm run preview` - Preview production build

## License

Private project - All rights reserved
