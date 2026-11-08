// background.js – MV3 service worker (port of MisterTube-V2 background.js)
// Seeds defaults once (never overwrites existing settings) and handles
// tab-reload requests so the popup never needs chrome.scripting directly.
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['extensionEnabled', 'vid', 'subsComment', 'sblock', 'thumbnails'], (current) => {
        if (chrome.runtime.lastError) {
            console.warn('YouTube Enhancer: could not read settings:', chrome.runtime.lastError.message);
            return;
        }
        const defaults = {};
        if (current.extensionEnabled === undefined) defaults.extensionEnabled = true;
        if (current.vid === undefined) defaults.vid = true;
        // Comments stay visible by default; user opts in via Disable Comments.
        if (current.subsComment === undefined) defaults.subsComment = false;
        if (current.sblock === undefined) defaults.sblock = true;
        if (current.thumbnails === undefined) defaults.thumbnails = true;
        if (Object.keys(defaults).length === 0) return;
        chrome.storage.sync.set(defaults, () => {
            if (chrome.runtime.lastError) {
                console.warn('YouTube Enhancer: could not write defaults:', chrome.runtime.lastError.message);
            } else {
                console.log('YouTube Enhancer initialized with default settings');
            }
        });
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reloadYouTubeTabs') {
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.warn('YouTube Enhancer: tab query failed:', chrome.runtime.lastError.message);
                sendResponse({ ok: false });
                return;
            }
            tabs.forEach((tab) => {
                if (tab.id === undefined) return;
                try {
                    chrome.tabs.reload(tab.id, () => void chrome.runtime.lastError);
                } catch (error) {
                    console.warn('YouTube Enhancer: tab reload failed:', error);
                }
            });
            sendResponse({ ok: true, count: tabs.length });
        });
        return true; // async response
    }
    return false;
});
