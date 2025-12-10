chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.windows.create({
            url: chrome.runtime.getURL(`index.html?targetTabId=${tab.id}`),
            type: 'popup',
            width: 1200,
            height: 900,
            focused: true
        }, (window) => {
            // Ensure window is at correct size immediately after creation
            if (window && window.id) {
                // Small delay to ensure window is fully created
                setTimeout(() => {
                    chrome.windows.update(window.id, {
                        width: 1200,
                        height: 900
                    });
                }, 100);
            }
        });
    }
});

