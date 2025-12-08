---
description: Build and Verify Extension
---

1. Run the build command
   - Command: `npm run build`
   - Cwd: `c:\Users\Jamie\Documents\Ai Dev Tools\Sampler Extension\Unified Sampler`
   - Ensure you see "built in ...s" in the output.

2. Verify Build Output
   - List the `dist` directory to confirm files were updated recently.
   - Command: `ls -l dist/assets` (or equivalent for Windows powershell: `Get-ChildItem dist/assets | Sort-Object LastWriteTime -Descending | Select-Object -First 5`)

3. Notify User
   - Explicitly mention that you have run the build and verified the output.
   - Remind them to reload the extension in Chrome (`chrome://extensions` -> Refresh).
