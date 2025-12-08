chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.windows.create({
            url: chrome.runtime.getURL(`index.html?targetTabId=${tab.id}`),
            type: 'popup',
            width: 900,
            height: 700
        });
    }
});

