// features/subs-comment.js
(function() {
    'use strict';

    // Configuration for subscription and comments features
    const SELECTORS = {
        COMMENTS_SECTION: 'ytd-comments#comments',
        SUBSCRIPTION_BUTTON: 'ytd-subscribe-button-renderer',
        COMMENTS_COUNT: 'ytd-comments-header-renderer #count',
        PINNED_COMMENT: 'ytd-comment-thread-renderer[is-pinned]',
        HEADER_AUTHOR: '#header-author',
        COMMENT_COUNT_DISPLAY: '#comment-count-display'
    };

    let observer = null;
    const addedNodes = [];

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

        enhanceComments();
        addCommentCountDisplay();
        enhanceSubscriptions();
        observeChanges();

        return cleanup;
    }

    // Parse YouTube's formatted counts, e.g. "1.2M", "345K", "1.5B", "1,234".
    function parseFormattedCount(text) {
        if (!text) return NaN;
        const cleaned = String(text).trim().toUpperCase().replace(/,/g, '');
        const match = cleaned.match(/^([\d.]+)\s*([KMB])?/);
        if (!match) return NaN;
        const value = parseFloat(match[1]);
        if (Number.isNaN(value)) return NaN;
        const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
        const multiplier = match[2] ? multipliers[match[2]] : 1;
        return value * multiplier;
    }

    // Format number with K/M/B
    function formatNumber(num) {
        if (Number.isNaN(num)) return '0';
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        }
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    function makeSpan(className, text) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        return span;
    }

    // Add comment count display
    function addCommentCountDisplay() {
        const headerAuthor = document.querySelector(SELECTORS.HEADER_AUTHOR);
        if (!headerAuthor) return;

        // Check if comment count display already exists
        if (document.querySelector(SELECTORS.COMMENT_COUNT_DISPLAY)) return;

        // Get comment count
        const commentsCount = document.querySelector(SELECTORS.COMMENTS_COUNT);
        if (!commentsCount) return;

        // Create comment count display element (no innerHTML)
        const commentCountDisplay = document.createElement('div');
        commentCountDisplay.id = 'comment-count-display';
        commentCountDisplay.className = 'youtube-enhancer-comment-count';

        // Format the count
        const count = parseFormattedCount(commentsCount.textContent);
        const formattedCount = Number.isNaN(count) ? '0' : formatNumber(count);

        // Set the content via textContent and created spans
        commentCountDisplay.appendChild(makeSpan('comment-count-icon', '💬'));
        commentCountDisplay.appendChild(makeSpan('comment-count-text', `${formattedCount} Comments`));

        // Add to header author area
        headerAuthor.appendChild(commentCountDisplay);
        addedNodes.push(commentCountDisplay);

        // Create subscriber count display element
        const subscriberCountDisplay = document.createElement('div');
        subscriberCountDisplay.className = 'youtube-enhancer-subscriber-count';
        subscriberCountDisplay.id = 'youtube-enhancer-subscriber-count';

        // Get subscriber count from YouTube's DOM
        const subCountElement = document.querySelector('yt-formatted-string#subscriber-count');
        if (subCountElement) {
            const parsedSubs = parseFormattedCount(subCountElement.textContent);
            const formattedSubs = Number.isNaN(parsedSubs) ? 'N/A' : formatNumber(parsedSubs);
            subscriberCountDisplay.appendChild(makeSpan('sub-icon', '👥'));
            subscriberCountDisplay.appendChild(makeSpan('sub-count', `${formattedSubs} subs`));
        } else {
            subscriberCountDisplay.textContent = 'Subscribers: N/A';
        }
        headerAuthor.appendChild(subscriberCountDisplay);
        addedNodes.push(subscriberCountDisplay);
    }

    // Enhance comments section
    function enhanceComments() {
        // Apply styling to comments section
        const commentsSection = document.querySelector(SELECTORS.COMMENTS_SECTION);
        if (commentsSection) {
            commentsSection.classList.add('youtube-enhancer-comments');

            // Highlight pinned comments
            const pinnedComment = document.querySelector(SELECTORS.PINNED_COMMENT);
            if (pinnedComment) {
                pinnedComment.classList.add('youtube-enhancer-pinned-comment');
            }
        }
    }

    // Enhance subscription button
    function enhanceSubscriptions() {
        const subButton = document.querySelector(SELECTORS.SUBSCRIPTION_BUTTON);
        if (subButton) {
            subButton.classList.add('youtube-enhancer-subscription');
        }
    }

    // Observe DOM changes to apply enhancements to dynamically loaded content
    function observeChanges() {
        observer = new MutationObserver((mutations) => {
            try {
                // Check if comments section is added
                const commentsSection = document.querySelector(SELECTORS.COMMENTS_SECTION);
                if (commentsSection && !commentsSection.classList.contains('youtube-enhancer-comments')) {
                    enhanceComments();
                }

                // Check for subscription button changes
                const subButton = document.querySelector(SELECTORS.SUBSCRIPTION_BUTTON);
                if (subButton && !subButton.classList.contains('youtube-enhancer-subscription')) {
                    enhanceSubscriptions();
                }

                // Check for header author area and add comment count if needed
                const headerAuthor = document.querySelector(SELECTORS.HEADER_AUTHOR);
                if (headerAuthor && !document.querySelector(SELECTORS.COMMENT_COUNT_DISPLAY)) {
                    addCommentCountDisplay();
                }
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

    // Cleanup function for when feature is disabled
    function cleanup() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        addedNodes.forEach(node => node.remove());
        addedNodes.length = 0;
        document.querySelectorAll('.youtube-enhancer-comments').forEach(el => {
            el.classList.remove('youtube-enhancer-comments');
        });
        document.querySelectorAll('.youtube-enhancer-pinned-comment').forEach(el => {
            el.classList.remove('youtube-enhancer-pinned-comment');
        });
        document.querySelectorAll('.youtube-enhancer-subscription').forEach(el => {
            el.classList.remove('youtube-enhancer-subscription');
        });
    }

    // Register with YouTube Enhancer (invoked by content.js; no self-init)
    window.youtubeEnhancer = window.youtubeEnhancer || {};
    window.youtubeEnhancer.subsComment = {
        init: init
    };
})();
