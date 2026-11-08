// content.js
(function() {
  'use strict';

  const CONFIG = {
    CUSTOM_CLASS: 'youtube-enhancer-enabled',
    FEATURE_FILES: {
      vid: { js: 'features/vidplayer.js', css: 'features/vidplayer.css' },
      subsComment: { js: 'features/subs-comment.js', css: 'features/subs-comment.css' },
      sblock: { js: 'features/shortsblock.js', css: 'features/shortsblock.css' },
      thumbnails: { js: 'features/thumbnails.js' }
    }
  };

  let isExtensionEnabled = true;
  const injectedElements = {};
  const activeFeatureCleanups = {};
  const featureGenerations = {};
  const pendingEnableDisabled = {};

  // Register the message listener SYNCHRONOUSLY (before any await) so popup
  // pings never race the async initialize() — the old "Receiving end does
  // not exist" failure was this race, not a missing script.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ status: 'alive' });
    } else if (message.action === 'toggleExtension') {
      handleToggleExtension(message.enabled);
      sendResponse({ status: 'success' });
    } else if (message.action === 'toggleFeature') {
      handleToggleFeature(message.feature, message.enabled);
      sendResponse({ status: 'success' });
    } else {
      sendResponse({ status: 'unknown_action' });
    }
    return true;
  });

  // V2 enable-class gate: CSS scopes under this class; toggled at init and on
  // storage changes so toggles apply without a reload.
  const FEATURE_CLASS_PREFIX = 'youtube-enhancer-feature-';

  function setEnabledClass(enabled) {
    const root = document.documentElement;
    if (root) root.classList.toggle(CONFIG.CUSTOM_CLASS, enabled);
    if (document.body) document.body.classList.toggle(CONFIG.CUSTOM_CLASS, enabled);
  }

  // Every feature CSS rule is gated on BOTH the master class and its own
  // per-feature class (e.g. `.youtube-enhancer-feature-vid`). Without this the
  // stylesheet is injected but rules never match — features looked dead even
  // when enabled. Toggled in enable/disable so toggles apply live.
  function setFeatureClass(feature, enabled) {
    const cls = FEATURE_CLASS_PREFIX + feature;
    const root = document.documentElement;
    if (root) root.classList.toggle(cls, enabled);
    if (document.body) document.body.classList.toggle(cls, enabled);
  }

  // V2 navigate gate: YouTube is an SPA, so re-apply after navigation.
  let navigateTimer = null;
  function handleNavigate() {
    clearTimeout(navigateTimer);
    navigateTimer = setTimeout(() => {
      // Refresh settings so feature re-inits (on next toggle) see fresh state.
      injectSettings();
    }, 300);
  }

  // Wait until document.head and document.body are available.
  function waitForDocumentReady() {
    return new Promise((resolve) => {
      if (document.head && document.body) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearInterval(intervalId);
        resolve();
      };
      const check = () => {
        if (document.head && document.body) {
          finish();
        }
      };
      // rAF does not fire in background/hidden tabs, so also poll on a timer.
      const intervalId = setInterval(check, 50);
      const rafCheck = () => {
        check();
        if (!settled) requestAnimationFrame(rafCheck);
      };
      requestAnimationFrame(rafCheck);
      check();
    });
  }

  // Feature scripts run in page context (no chrome.* APIs), so expose the
  // current settings for them to read via window.youtubeEnhancerSettings.
  async function injectSettings() {
    const features = await chrome.storage.sync.get(Object.keys(CONFIG.FEATURE_FILES));
    const featureStates = {};
    Object.keys(CONFIG.FEATURE_FILES).forEach((feature) => {
      featureStates[feature] = features[feature] !== false;
    });
    window.youtubeEnhancerSettings = {
      extensionEnabled: isExtensionEnabled,
      features: featureStates
    };
  }

  async function initialize() {
    console.log('Initializing content script');
    await waitForDocumentReady();

    const extResult = await chrome.storage.sync.get(['extensionEnabled']);
    isExtensionEnabled = extResult.extensionEnabled !== false;
    await toggleExtensionFeatures(isExtensionEnabled);

    const features = await chrome.storage.sync.get(Object.keys(CONFIG.FEATURE_FILES));
    console.log('Feature states:', features);
    for (const feature of Object.keys(CONFIG.FEATURE_FILES)) {
      if (features[feature] !== false && isExtensionEnabled) {
        await enableFeature(feature);
      }
    }
    // Listener lives at top level (sync registration); nothing to add here.
  }

  async function handleToggleExtension(enabled) {
    isExtensionEnabled = enabled;
    await toggleExtensionFeatures(enabled);
    const features = await chrome.storage.sync.get(Object.keys(CONFIG.FEATURE_FILES));
    for (const feature of Object.keys(CONFIG.FEATURE_FILES)) {
      if (features[feature] !== false && isExtensionEnabled) {
        await enableFeature(feature);
      } else {
        await disableFeature(feature);
      }
    }
  }

  async function handleToggleFeature(feature, enabled) {
    if (enabled && isExtensionEnabled) {
      await enableFeature(feature);
    } else {
      await disableFeature(feature);
    }
  }

  async function enableFeature(feature) {
    if (!CONFIG.FEATURE_FILES[feature]) return;
    if (activeFeatureCleanups[feature]) return;
    const generation = featureGenerations[feature] = (featureGenerations[feature] || 0) + 1;
    pendingEnableDisabled[feature] = false;
    const isCancelled = () => featureGenerations[feature] !== generation;
    const bailIfCancelled = () => {
      if (!isCancelled()) return false;
      // Latest intent is disabled: drop any CSS injected after the disable.
      // If a newer enable has started, it owns those elements — leave them.
      if (pendingEnableDisabled[feature]) {
        const css = injectedElements[feature]?.css || document.getElementById(`youtube-enhancer-${feature}-css`);
        if (css) css.remove();
        delete injectedElements[feature];
      }
      return true;
    };
    try {
      await waitForDocumentReady();
      if (bailIfCancelled()) return;
      setFeatureClass(feature, true); // CSS for this feature only now applies.
      await injectSettings();
      if (bailIfCancelled()) return;
      // Features (JS + CSS) are declared in the manifest's content_scripts
      // (CSP-exempt isolated world), so no page-context loads are needed.
      // Poll briefly for a late registration, then init.
      for (let i = 0; i < 10 && !window.youtubeEnhancer?.[feature]?.init; i++) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (bailIfCancelled()) return;
      if (window.youtubeEnhancer?.[feature]?.init) {
        const cleanup = window.youtubeEnhancer[feature].init();
        if (cleanup) activeFeatureCleanups[feature] = cleanup;
      }
      console.log(`Enabled feature: ${feature}`);
    } catch (error) {
      console.error(`Error enabling ${feature}:`, error);
    }
  }

  async function disableFeature(feature) {
    if (!CONFIG.FEATURE_FILES[feature]) return;
    // Drop the feature's CSS gate first so its styles stop matching instantly,
    // then run the JS cleanup which restores anything the scripts changed.
    setFeatureClass(feature, false);
    // Invalidate any in-flight enableFeature so it bails before init().
    featureGenerations[feature] = (featureGenerations[feature] || 0) + 1;
    pendingEnableDisabled[feature] = true;
    if (activeFeatureCleanups[feature]) {
      try {
        activeFeatureCleanups[feature]();
      } catch (error) {
        console.error(`Error cleaning up ${feature}:`, error);
      }
      delete activeFeatureCleanups[feature];
    }
    // CSS comes from the manifest's content_scripts (CSP-exempt), so
    // disabling only needs the feature's own cleanup — nothing to detach.
    delete injectedElements[feature];
    console.log(`Disabled feature: ${feature}`);
  }

  async function toggleExtensionFeatures(enabled) {
    await waitForDocumentReady();
    setEnabledClass(enabled);
  }

  // Keep the enable-class in sync without a reload (picks up popup writes).
  // Previously this only toggled the class — features stayed running when
  // the master toggle was turned OFF, so the extension "worked" while off.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if ('extensionEnabled' in changes) {
      isExtensionEnabled = changes.extensionEnabled.newValue !== false;
      setEnabledClass(isExtensionEnabled);
      // Master switch must live-disable every feature, not just CSS.
      handleToggleExtension(isExtensionEnabled);
    }
    // Feature toggles: live enable/disable without reload (replaces messaging).
    for (const [feature, change] of Object.entries(changes)) {
      if (Object.prototype.hasOwnProperty.call(CONFIG.FEATURE_FILES, feature)) {
        handleToggleFeature(feature, change.newValue !== false);
      }
    }
  });

  // V2 navigate gate: re-evaluate after SPA navigations.
  document.addEventListener('yt-navigate-finish', handleNavigate);

  initialize();
})();
