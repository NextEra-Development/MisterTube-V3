// features/subs-comment.js
// Repurposed: "Disable Comments" — when ON, comments are removed as a whole;
// when OFF (cleanup), they show again. Storage key stays `subsComment`.
(function() {
    'use strict';

    const COMMENT_SELECTORS = [
        'ytd-comments#comments',
        '#comments',
        'ytd-comments-header-renderer',
        'ytd-comment-simplebox-renderer',
        'ytd-engagement-panel-section-list-renderer[target-id="comments-panel"]'
    ];

    let observer = null;
    let hiddenNodes = new Set();

    // V2 visibility discipline: only hide nodes that are actually connected
    // and visible, so lazy SPA mounts don't trigger off-screen work.
    function isVisible(el) {
        if (!el.isConnected) return false;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return false;
        for (let node = el; node; node = node.parentElement) {
            const cs = getComputedStyle(node);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        }
        return true;
    }

    // V2 waitForElement: poll for a selector with a timeout (MutationObserver).
    function waitForElement(selector, timeoutMs) {
        return new Promise((resolve) => {
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }
            let settled = false;
            const finish = (element) => {
                if (settled) return;
                settled = true;
                poller.disconnect();
                clearTimeout(timeout);
                resolve(element);
            };
            const poller = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) finish(element);
            });
            const timeout = setTimeout(() => finish(null), timeoutMs);
            poller.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        });
    }

    // Settings are injected by content.js into page context (window.youtubeEnhancerSettings);
    // this script runs in page context and must not use chrome.* APIs.
    function readSettings() {
        return window.youtubeEnhancerSettings || { extensionEnabled: true, features: {} };
    }

    // Initialize the feature. Called by content.js via window.youtubeEnhancer.subsComment.init().
    function init() {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            console.error('YouTube Enhancer: Invalid browser environment');
            return cleanup;
        }

        const settings = readSettings();
        if (settings.extensionEnabled === false) return cleanup;
        if (settings.features && settings.features.subsComment === false) return cleanup;

        // V2 setupUI pattern: wait (bounded) for the comments surface, then hide it.
        // The MutationObserver covers surfaces that mount after the wait fires.
        waitForElement('#comments', 15000).then(() => {
            disableComments();
            observeChanges();
        });

        return cleanup;
    }

    // Disable comments as a whole: hide every comment surface + the engage button region.
    function disableComments() {
        COMMENT_SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (!isVisible(el)) return; // V2 discipline: skip off-screen/hidden nodes
                hiddenNodes.add(el);
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('height', '0', 'important');
                el.style.setProperty('margin', '0', 'important');
                el.style.setProperty('padding', '0', 'important');
            });
        });
    }

    // Observe DOM changes so late-loaded comment surfaces also get hidden.
    function observeChanges() {
        observer = new MutationObserver(() => {
            try {
                disableComments();
            } catch (error) {
                console.error('YouTube Enhancer: Error processing mutations:', error);
            }
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Cleanup function for when feature is disabled — show comments again.
    function cleanup() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        hiddenNodes.forEach(el => {
            el.style.removeProperty('display');
            el.style.removeProperty('visibility');
            el.style.removeProperty('height');
            el.style.removeProperty('margin');
            el.style.removeProperty('padding');
        });
        hiddenNodes = new Set();
    }

    // Register with YouTube Enhancer (invoked by content.js; no self-init)
    window.youtubeEnhancer = window.youtubeEnhancer || {};
    window.youtubeEnhancer.subsComment = {
        init: init
    };
})();
