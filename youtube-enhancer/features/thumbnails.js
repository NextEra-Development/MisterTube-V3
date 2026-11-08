// features/thumbnails.js
// "Show video frames": replace uploader-designed thumbnails with YouTube's
// auto-generated video frame. Mirrors the subs-comment.js patterns:
// page-context only (no chrome.* APIs), visibility-gated sweeps, and an
// idempotent cleanup that restores every saved original.
// NOTE: mq/hqdefault.jpg is YouTube's auto-generated still frame, not an
// exact 50% timestamp — copy elsewhere says "a frame from the middle of the
// video", keep in mind this is an approximation, not a literal mid-point.
(function() {
  'use strict';

  const FRAME_BASE = 'https://i.ytimg.com/vi/';
  const MQ = '/mqdefault.jpg';
  const HQ_FALLBACK = '/hqdefault.jpg';

  let observer = null;
  let intersectionObserver = null;
  let debounceTimer = null;
  let maxWaitTimer = null;
  let swapped = new Set();
  let observedImgs = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  let originalOnErrorMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  let initialized = false;

  // Pure helpers (also exposed for tests)
  function frameUrl(id) {
    return FRAME_BASE + id + MQ;
  }

  function hqFrameUrl(id) {
    return FRAME_BASE + id + HQ_FALLBACK;
  }

  function extractVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    let m;
    // watch?v=VIDEOID (11-char YouTube ID, may stop at & or #)
    m = url.match(/[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    // /shorts/VIDEOID
    m = url.match(/\/shorts\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    // youtu.be/VIDEOID
    m = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    // /embed/VIDEOID
    m = url.match(/\/embed\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    // /live/VIDEOID
    m = url.match(/\/live\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    if (m) return m[1];
    // /vi/VIDEOID/ (thumbnail frame URLs like i.ytimg.com/vi/ID/...)
    m = url.match(/\/vi\/([A-Za-z0-9_-]{11})\//);
    if (m) return m[1];
    return null;
  }

  // Mirror subs-comment.js isVisible discipline: only swap visible nodes.
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

  function readSettings() {
    return window.youtubeEnhancerSettings || { extensionEnabled: true, features: {} };
  }

  function getAnchorId(img) {
    const anchor = img.closest ? img.closest('a[href]') : null;
    if (!anchor) return null;
    const href = anchor.href || anchor.getAttribute('href') || null;
    return href ? extractVideoId(href) : null;
  }

  function installSwap(img, id, originalOnError) {
    if (originalOnErrorMap) {
      try { originalOnErrorMap.set(img, originalOnError || null); } catch (_) {}
    }
    let triedHq = false;
    img.onerror = function() {
      if (!triedHq) {
        triedHq = true;
        img.src = hqFrameUrl(id);
        return;
      }
      // Restore original on second error.
      restoreImage(img);
      if (typeof originalOnError === 'function') {
        try { originalOnError.call(img); } catch (_) {}
      }
    };
    img.src = frameUrl(id);
    if (img.srcset !== undefined) img.srcset = '';
    if (img.removeAttribute) {
      // Avoid stale large srcset overriding the swapped frame.
      if (img.hasAttribute && img.hasAttribute('srcset')) img.removeAttribute('srcset');
    }
  }

  function swapImage(img) {
    if (!img) return;
    const isSwapped = swapped.has(img) || (img.dataset && img.dataset.thumbSwapped === '1');
    if (isSwapped) {
      // SPA node recycling: re-extract the video ID on each sweep and
      // re-swap when the enclosing href/src changed.
      const anchorId = getAnchorId(img);
      const storedId = img.dataset ? img.dataset.thumbVideoId : null;
      const srcId = extractVideoId(img.currentSrc || img.src || '');
      let currentId = null;
      if (anchorId && anchorId !== storedId) {
        // Anchor changed (or stored id unknown but src frame differs below).
        if (storedId || !srcId || srcId !== anchorId) currentId = anchorId;
      }
      if (!currentId && srcId && srcId !== storedId && srcId !== anchorId) {
        // Sibling check: src changed externally to a different video and is
        // no longer our swapped frame for the stored id.
        const isOurFrame = storedId && (img.src === frameUrl(storedId) || img.src === hqFrameUrl(storedId));
        if (!isOurFrame) currentId = srcId;
      }
      if (!currentId) return;
      if (!isVisible(img)) return;
      const originalOnError = originalOnErrorMap && originalOnErrorMap.has(img)
        ? originalOnErrorMap.get(img)
        : null;
      if (img.dataset) img.dataset.thumbVideoId = currentId;
      swapped.add(img);
      installSwap(img, currentId, originalOnError);
      return;
    }
    // Find a video id from an enclosing <a href>, or from the current src.
    let href = null;
    const anchor = img.closest ? img.closest('a[href]') : null;
    if (anchor) href = anchor.href || anchor.getAttribute('href') || null;
    let id = href ? extractVideoId(href) : null;
    if (!id) id = extractVideoId(img.currentSrc || img.src || '');
    if (!id) return; // invalid → no-op

    if (!isVisible(img)) return;

    const originalSrc = img.getAttribute('src') || img.src || '';
    const srcsetAttr = img.getAttribute ? img.getAttribute('srcset') : null;
    const hadSrcset = srcsetAttr !== null && srcsetAttr !== undefined &&
      !(img.hasAttribute && !img.hasAttribute('srcset'));
    const originalSrcset = srcsetAttr || '';

    if (img.dataset) {
      img.dataset.originalSrc = originalSrc;
      img.dataset.originalSrcset = originalSrcset;
      img.dataset.originalSrcsetPresent = hadSrcset ? '1' : '0';
      img.dataset.thumbVideoId = id;
      img.dataset.thumbSwapped = '1';
    }
    swapped.add(img);

    // Two-step onerror: mqdefault → hqdefault → original.
    const originalOnError = img.onerror;
    installSwap(img, id, originalOnError);
  }

  function restoreImage(img) {
    if (!img || !img.dataset) return;
    const originalSrc = img.dataset.originalSrc;
    const originalSrcset = img.dataset.originalSrcset;
    const originalSrcsetPresent = img.dataset.originalSrcsetPresent;
    if (originalSrc === undefined && originalSrcset === undefined && originalSrcsetPresent === undefined) return;
    if (originalOnErrorMap && originalOnErrorMap.has(img)) {
      img.onerror = originalOnErrorMap.get(img) || null;
      try { originalOnErrorMap.delete(img); } catch (_) {}
    } else {
      img.onerror = null;
    }
    if (originalSrc !== undefined) {
      if (img.setAttribute) img.setAttribute('src', originalSrc);
      else img.src = originalSrc;
    }
    if (originalSrcsetPresent === '0') {
      if (img.removeAttribute) img.removeAttribute('srcset');
      else if (img.srcset !== undefined) img.srcset = '';
    } else if (originalSrcset !== undefined) {
      if (img.setAttribute) img.setAttribute('srcset', originalSrcset);
      else if (img.srcset !== undefined) img.srcset = originalSrcset;
    }
    delete img.dataset.originalSrc;
    delete img.dataset.originalSrcset;
    delete img.dataset.originalSrcsetPresent;
    delete img.dataset.thumbSwapped;
    delete img.dataset.thumbVideoId;
    swapped.delete(img);
  }

  function sweep() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    // Prune detached nodes so infinite-scroll sessions can GC them.
    [...swapped].forEach((img) => {
      if (img.isConnected === false) swapped.delete(img);
    });
    // YouTube's grid DOM changed (yt-lockup-view-model / a#thumbnail /
    // yt-thumbnail-view-model) — a single 'ytd-thumbnail img' selector missed
    // most thumbnails. Cover every shape and de-dupe.
    const selectors = [
      'ytd-thumbnail img',
      'a#thumbnail img',
      'ytd-compact-video-renderer img',
      'ytd-video-renderer img',
      'yt-lockup-view-model img',
      'yt-thumbnail-view-model img',
      'img[src*="/vi/"]',
      'img[srcset*="/vi/"]'
    ];
    const images = new Set();
    selectors.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((img) => images.add(img));
      } catch (_) {}
    });
    if (intersectionObserver && observedImgs && images.forEach) {
      images.forEach((img) => {
        if (!observedImgs.has(img)) {
          try {
            intersectionObserver.observe(img);
            observedImgs.add(img);
          } catch (_) {}
        }
      });
    }
    images.forEach((img) => {
      try {
        swapImage(img);
      } catch (error) {
        console.error('YouTube Enhancer: Error swapping thumbnail:', error);
      }
    });
  }

  function scheduleSweep() {
    // Throttle with trailing execution + max-wait cap so continuous
    // mutations (<100ms apart) cannot starve the sweep indefinitely.
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (maxWaitTimer !== null) {
        clearTimeout(maxWaitTimer);
        maxWaitTimer = null;
      }
      sweep();
    }, 100);
    if (maxWaitTimer === null) {
      maxWaitTimer = setTimeout(() => {
        maxWaitTimer = null;
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        sweep();
      }, 500);
    }
  }

  function init() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.error('YouTube Enhancer: Invalid browser environment');
      return cleanup;
    }
    if (initialized) return cleanup;
    const settings = readSettings();
    if (settings.features && settings.features.thumbnails !== false) {
      // Only run when enabled (default true when key absent).
      initialized = true;
      if (document.body && typeof MutationObserver !== 'undefined') {
        if (observer) {
          try { observer.disconnect(); } catch (_) {}
          observer = null;
        }
        observer = new MutationObserver(scheduleSweep);
        observer.observe(document.body, { childList: true, subtree: true });
      }
      if (typeof IntersectionObserver !== 'undefined') {
        try {
          intersectionObserver = new IntersectionObserver((entries) => {
            const anyVisible = entries && [...entries].some((e) => e.isIntersecting);
            if (anyVisible) scheduleSweep();
          });
        } catch (_) {
          intersectionObserver = null;
        }
      }
      if (window && typeof window.addEventListener === 'function') {
        window.addEventListener('scroll', scheduleSweep, { passive: true });
      }
      if (document && typeof document.addEventListener === 'function') {
        document.addEventListener('yt-navigate-finish', scheduleSweep);
      }
      sweep();
    }
    return cleanup;
  }

  function cleanup() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer !== null) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
    if (observer) {
      try { observer.disconnect(); } catch (_) {}
      observer = null;
    }
    if (intersectionObserver) {
      try { intersectionObserver.disconnect(); } catch (_) {}
      intersectionObserver = null;
    }
    if (typeof window !== 'undefined' && window && typeof window.removeEventListener === 'function') {
      try { window.removeEventListener('scroll', scheduleSweep); } catch (_) {}
    }
    if (typeof document !== 'undefined' && document && typeof document.removeEventListener === 'function') {
      try { document.removeEventListener('yt-navigate-finish', scheduleSweep); } catch (_) {}
    }
    // Restore every swapped original (idempotent: cleared set = no-op).
    [...swapped].forEach((img) => restoreImage(img));
    swapped = new Set();
    observedImgs = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    initialized = false;
  }

  window.youtubeEnhancer = window.youtubeEnhancer || {};
  window.youtubeEnhancer.thumbnails = {
    init,
    cleanup,
    frameUrl,
    hqFrameUrl,
    extractVideoId,
    _isVisible: isVisible,
    _sweep: sweep
  };
})();
