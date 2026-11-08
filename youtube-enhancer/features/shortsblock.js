// features/shortsblock.js

(function() {
    'use strict';

    // Store original History API methods for exact restoration in cleanup
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    let wrapped = false;
    let initTimer = null;

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
        }, 300); // 300ms delay to catch late redirects

        return cleanup;
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
