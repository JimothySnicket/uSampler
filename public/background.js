chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        // Check saved UI mode preference to determine initial window size
        chrome.storage.local.get(['uSampler-uiMode'], (result) => {
            const uiMode = result['uSampler-uiMode'] || 'compact'; // Default to compact

            // Set size based on UI mode
            // Set size based on UI mode (Updated to 800x600 for better visibility)
            const size = uiMode === 'compact'
                ? { width: 800, height: 600 }
                : { width: 1200, height: 900 };

            chrome.windows.create({
                url: chrome.runtime.getURL(`index.html?targetTabId=${tab.id}`),
                type: 'popup',
                width: size.width,
                height: size.height,
                focused: true
            }, (window) => {
                // Ensure window is at correct size immediately after creation
                if (window && window.id) {
                    setTimeout(() => {
                        chrome.windows.update(window.id, size);
                    }, 100);
                }
            });
        });
    }
});

