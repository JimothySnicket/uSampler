---
layout: default
title: Third-Party Licenses — uSampler
---

# Third-Party Licenses

uSampler uses the following open-source libraries. All run locally; none transmit data externally.

---

## LAME (via lamejs) -- LGPL-3.0

**Package:** lamejs v1.2.1
**License:** GNU Lesser General Public License v3.0 (LGPL-3.0)
**Website:** [https://lame.sourceforge.net](https://lame.sourceforge.net)
**File:** `public/lame.all.js`

MP3 encoding is provided by the LAME encoder, loaded as a separate JavaScript file (`lame.all.js`). No modifications have been made to the LAME source code. Per LGPL-3.0 requirements:

1. LAME is acknowledged as the MP3 encoding library used in this project.
2. The LAME source code is available at [https://lame.sourceforge.net](https://lame.sourceforge.net)
3. LAME is linked as a separate file, not compiled into the application bundle.
4. The lamejs npm package source is available at [https://github.com/nicholasgasior/lamejs](https://github.com/nicholasgasior/lamejs)

---

## JSZip -- MIT

**Package:** jszip v3.10.1
**License:** MIT (dual-licensed MIT OR GPL-3.0-or-later; MIT chosen)
**Website:** [https://stuk.github.io/jszip/](https://stuk.github.io/jszip/)

Used for session save/load and batch export as ZIP archives.

---

## React -- MIT

**Packages:** react v19.2.1, react-dom v19.2.1
**License:** MIT
**Website:** [https://react.dev](https://react.dev)

---

## Zustand -- MIT

**Package:** zustand v5.0.9
**License:** MIT
**Website:** [https://zustand.docs.pmnd.rs](https://zustand.docs.pmnd.rs)

Used for playback state management.

---

## Lucide React -- ISC

**Package:** lucide-react v0.556.0
**License:** ISC
**Website:** [https://lucide.dev](https://lucide.dev)

Icon library used throughout the UI.

---

## Motion -- MIT

**Package:** motion v12.23.26
**License:** MIT
**Website:** [https://motion.dev](https://motion.dev)

Used for UI animations.

---

## clsx -- MIT

**Package:** clsx v2.1.1
**License:** MIT
**Website:** [https://github.com/lukeed/clsx](https://github.com/lukeed/clsx)

Utility for constructing className strings.

---

## tailwind-merge -- MIT

**Package:** tailwind-merge v3.4.0
**License:** MIT
**Website:** [https://github.com/dcastil/tailwind-merge](https://github.com/dcastil/tailwind-merge)

Utility for merging Tailwind CSS classes.

---

## MIT License Text (applies to packages marked MIT above)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

## ISC License Text (applies to packages marked ISC above)

```
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE.
```
