# Lazy Loading Model Options

## How Lazy Loading Works

Lazy loading means models are **not loaded until the user actually uses the feature**. This improves initial extension load time.

## Option 1: Bundled Models with Lazy Loading ⭐ (Recommended)

**How it works:**
- Models are **bundled in the extension** (in `public/models/`)
- But only loaded when user clicks "Separate Stems"
- Models stay on user's computer (no server needed)

**Pros:**
- ✅ Works offline
- ✅ No server costs
- ✅ Fast after first load (cached)
- ✅ No internet required

**Cons:**
- ❌ Extension package is large (~100-500 MB)
- ❌ Longer initial install/download time

**Implementation:**
```typescript
// Models are in public/models/umx-5stems/
// Loaded only when separateStems() is called
const model = await tf.loadLayersModel('/models/umx-5stems/vocals/model.json');
```

## Option 2: CDN/Server Hosted Models

**How it works:**
- Models hosted on **GitHub Releases** or **CDN** (like jsDelivr)
- Extension downloads models on **first use**
- Caches locally using Chrome Storage API
- Subsequent uses load from cache

**Pros:**
- ✅ Small extension package (~few MB)
- ✅ Fast install
- ✅ Can update models without updating extension

**Cons:**
- ❌ Requires internet on first use
- ❌ Server/CDN hosting needed (but GitHub Releases is free)
- ❌ Slower first use (download time)

**Implementation:**
```typescript
// Check cache first
const cached = await chrome.storage.local.get('model-vocals');
if (cached) {
  // Load from cache
} else {
  // Download from CDN
  const model = await tf.loadLayersModel('https://cdn.example.com/models/vocals/model.json');
  // Cache it
  await chrome.storage.local.set({ 'model-vocals': model });
}
```

## Option 3: Hybrid Approach

**How it works:**
- Check if models exist locally (bundled)
- If not, download from CDN
- Cache downloaded models

**Pros:**
- ✅ Flexible
- ✅ Can bundle small models, download large ones

**Cons:**
- ❌ More complex code

## Recommendation: Option 1 (Bundled + Lazy Load)

For a Chrome extension:
1. **Bundle models** in `public/models/`
2. **Lazy load** when feature is used
3. **Cache in memory** (already implemented)

**Why:**
- Chrome extensions can be up to 2GB
- Users expect features to work offline
- No server costs
- Simpler implementation

## File Structure

```
extension/
├── public/
│   └── models/
│       └── umx-5stems/
│           ├── vocals/
│           │   ├── model.json
│           │   └── weights.bin
│           ├── drums/
│           │   ├── model.json
│           │   └── weights.bin
│           └── ...
└── src/
    └── utils/
        └── stemSeparator.ts  // Loads from /models/...
```

## Current Implementation

Your code already does lazy loading! Models are only loaded when `separateStems()` is called.

**What you need:**
- Just place model files in `public/models/umx-5stems/`
- They'll be bundled automatically
- Loaded on-demand

## Size Considerations

- **Extension package**: Large (~100-500 MB)
- **Initial load**: Fast (models not loaded)
- **First use**: Slower (loading models)
- **Subsequent uses**: Fast (cached in memory)

## Alternative: Option 2 (CDN)

If you want smaller extension:
1. Host models on GitHub Releases
2. Download on first use
3. Cache with Chrome Storage API

Want me to implement Option 2 (CDN download + cache)?

