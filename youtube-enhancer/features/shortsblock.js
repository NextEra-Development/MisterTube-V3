// features/shortsblock.js

(function() {
    'use strict';

    // Store original History API methods for exact restoration in cleanup
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    let wrapped = false;
    let initTimer = null;
    let feedObserver = null;

    function init() {
        console.log('YouTube Enhancer: Initializing shortsblock feature');

        // Add delay to ensure page state is ready
        initTimer = setTimeout(() => {
            initTimer = null;
            if (window.location.pathname.startsWith('/shorts/')) {
                redirectToHomepage();
                return;
            }
            setupUrlChangeListener();
            hideShortsInFeed();
        }, 300); // 300ms delay to catch late redirects

        return cleanup;
    }

    // (Homepage + search + suggested) — CSS alone can't catch YouTube's SPA
    // re-renders, so sweep for Shorts nodes that appear lazily and hide them.
    function hideShortsInFeed() {
        // Hide guide entry + collapse its gap
        document.querySelectorAll('#guide ytd-guide-entry-renderer, #guide tp-yt-paper-item').forEach(el => {
            const link = el.querySelector('a[href="/feed/shorts"]');
            if (el.getAttribute('aria-label') === 'Shorts' || link) {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('margin', '0', 'important');
                el.style.setProperty('padding', '0', 'important');
                el.style.setProperty('height', '0', 'important');
                el.style.setProperty('min-height', '0', 'important');
            }
        });
        const guide = document.getElementById('guide');
        if (guide) guide.style.setProperty('gap', '0', 'important');

        // Hide homepage shelves + grid cards that link to /shorts/
        document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-rich-shelf-renderer').forEach(el => {
            const shortsLink = el.querySelector('a[href*="/shorts/"]');
            if (shortsLink) {
                el.style.setProperty('display', 'none', 'important');
            }
        });

        if (!feedObserver && document.body) {
            feedObserver = new MutationObserver(hideShortsInFeed);
            feedObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    function redirectToHomepage() {
        try {
            const currentUrl = new URL(window.location.href);
            if (!currentUrl.pathname.startsWith('/shorts/')) return;

            const videoId = currentUrl.pathname.split('/shorts/')[1]?.split('/')[0];
            if (!videoId) return;

            // Check if we've already redirected to avoid redirect loops
            const redirectKey = `ytEnhancerShortsBlocked_${videoId}`;
            if (sessionStorage.getItem(redirectKey)) return;
            sessionStorage.setItem(redirectKey, Date.now().toString());

            // Redirect to homepage
            const homeUrl = new URL('/', currentUrl.origin);

            // Use history.replaceState for smoother transition
            history.replaceState(null, '', homeUrl.toString());
            // Force reload to ensure proper page rendering
            window.location.reload();
        } catch (error) {
            console.error('YouTube Enhancer: Error in redirectToHomepage:', error);
        }
    }

    // Listen for URL changes to catch dynamic navigation to shorts
    function setupUrlChangeListener() {
        if (wrapped) return;
        wrapped = true;

        // Override pushState
        history.pushState = function() {
            originalPushState.apply(this, arguments);
            checkForShortsUrl();
        };

        // Override replaceState
        history.replaceState = function() {
            originalReplaceState.apply(this, arguments);
            checkForShortsUrl();
        };

        // Listen for popstate events (back/forward navigation)
        window.addEventListener('popstate', checkForShortsUrl);

        // Initial check
        checkForShortsUrl();
    }

    function checkForShortsUrl() {
        if (window.location.pathname.startsWith('/shorts/')) {
            redirectToHomepage();
        }
    }

    // Cleanup function for when feature is disabled
    function cleanup() {
        console.log('YouTube Enhancer: Cleaning up shortsblock feature');
        if (initTimer !== null) {
            clearTimeout(initTimer);
            initTimer = null;
        }
        if (feedObserver) {
            feedObserver.disconnect();
            feedObserver = null;
        }
        // Restore the exact original History API methods
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        // Remove event listener
        window.removeEventListener('popstate', checkForShortsUrl);
        wrapped = false;
    }

    // Register with YouTube Enhancer
    window.youtubeEnhancer = window.youtubeEnhancer || {};
    window.youtubeEnhancer.sblock = {
        init: init
    };
})();
