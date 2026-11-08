// features/shorts2long.js

(function() {
    'use strict';

    let observer = null;
    let clickHandler = null;
    let initTimer = null;

    function init() {
        console.log('YouTube Enhancer: Initializing shorts2long feature');

        // Add delay to ensure page state is ready
        initTimer = setTimeout(() => {
            initTimer = null;
            if (window.location.pathname.startsWith('/shorts/')) {
                redirectToWatchUrl();
                return;
            }
            setupLinkObserver();
        }, 300); // 300ms delay to catch late redirects

        return cleanup;
    }

    function redirectToWatchUrl() {
        try {
            const currentUrl = new URL(window.location.href);
            if (!currentUrl.pathname.startsWith('/shorts/')) return;

            const videoId = currentUrl.pathname.split('/shorts/')[1]?.split('/')[0];
            if (!videoId) return;

            // Check if we've already redirected
            const redirectKey = `ytEnhancerRedirected_${videoId}`;
            if (sessionStorage.getItem(redirectKey)) return;
            sessionStorage.setItem(redirectKey, Date.now().toString());

            const newUrl = new URL('/watch', currentUrl.origin);
            newUrl.searchParams.set('v', videoId);

            // Preserve parameters
            currentUrl.searchParams.forEach((value, key) => {
                if (key !== 'v') newUrl.searchParams.set(key, value);
            });

            newUrl.hash = currentUrl.hash;

            // Use history.replaceState for smoother transition
            history.replaceState(null, '', newUrl.toString());
            // Force reload to ensure player loads correctly
            window.location.reload();
        } catch (error) {
            console.error('YouTube Enhancer: Error in redirectToWatchUrl:', error);
        }
    }

    // Intercept clicks on shorts links
    function setupLinkObserver() {
        clickHandler = function(event) {
            try {
                // Look for link elements in the event path
                const path = event.composedPath();
                for (const element of path) {
                    if (element.tagName === 'A' && element.href && element.href.includes('/shorts/')) {
                        // Prevent default navigation
                        event.preventDefault();
                        event.stopPropagation();

                        // Convert shorts URL to watch URL
                        const shortsUrl = new URL(element.href);
                        const videoId = shortsUrl.pathname.split('/shorts/')[1]?.split('/')[0];

                        if (videoId) {
                            // Create watch URL
                            const watchUrl = new URL('/watch', shortsUrl.origin);
                            watchUrl.searchParams.set('v', videoId);

                            // Preserve other parameters
                            shortsUrl.searchParams.forEach((value, key) => {
                                if (key !== 'v') {
                                    watchUrl.searchParams.set(key, value);
                                }
                            });

                            // Navigate to the watch URL
                            window.location.href = watchUrl.toString();
                            return;
                        }
                    }
                }
            } catch (error) {
                console.error('YouTube Enhancer: Error in click handler:', error);
            }
        };
        document.addEventListener('click', clickHandler, true); // Use capture phase to catch events before they reach the target

        // Also modify all existing shorts links on the page
        modifyExistingShortsLinks();

        // Set up observer to modify shorts links as they're added to the DOM
        observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    modifyExistingShortsLinks();
                }
            }
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Find and modify all shorts links on the page
    function modifyExistingShortsLinks() {
        try {
            const shortsLinks = document.querySelectorAll('a[href*="/shorts/"]');
            shortsLinks.forEach(link => {
                if (!link.hasAttribute('data-shorts-converted')) {
                    const shortsUrl = new URL(link.href);
                    const videoId = shortsUrl.pathname.split('/shorts/')[1]?.split('/')[0];

                    if (videoId) {
                        const watchUrl = new URL('/watch', shortsUrl.origin);
                        watchUrl.searchParams.set('v', videoId);

                        // Preserve other parameters
                        shortsUrl.searchParams.forEach((value, key) => {
                            if (key !== 'v') {
                                watchUrl.searchParams.set(key, value);
                            }
                        });

                        // Update the href
                        link.href = watchUrl.toString();

                        // Mark as converted
                        link.setAttribute('data-shorts-converted', 'true');
                    }
                }
            });
        } catch (error) {
            console.error('YouTube Enhancer: Error in modifyExistingShortsLinks:', error);
        }
    }

    // Cleanup function for when feature is disabled
    function cleanup() {
        console.log('YouTube Enhancer: Cleaning up shorts2long feature');
        if (initTimer !== null) {
            clearTimeout(initTimer);
            initTimer = null;
        }
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (clickHandler) {
            document.removeEventListener('click', clickHandler, true);
            clickHandler = null;
        }
        // Restore converted link hrefs is not reliable after YouTube re-renders;
        // the converted markers are removed so a later re-init can re-convert links.
        document.querySelectorAll('a[data-shorts-converted]').forEach(link => {
            link.removeAttribute('data-shorts-converted');
        });
    }

    // Register with YouTube Enhancer
    window.youtubeEnhancer = window.youtubeEnhancer || {};
    window.youtubeEnhancer.shorts2long = {
        init: init
    };
})();
