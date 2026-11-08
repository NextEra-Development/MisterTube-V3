// content.js
(function() {
  'use strict';

  const CONFIG = {
    CUSTOM_CLASS: 'youtube-enhancer-enabled',
    FEATURE_FILES: {
      vid: { js: 'features/vidplayer.js', css: 'features/vidplayer.css' },
      shorts2long: { js: 'features/shorts2long.js', css: 'features/shorts2long.css' },
      subsComment: { js: 'features/subs-comment.js', css: 'features/subs-comment.css' },
      sblock: { js: 'features/shortsblock.js', css: 'features/shortsblock.css' }
    }
  };

  let isExtensionEnabled = true;
  const injectedElements = {};
  const activeFeatureCleanups = {};
  const featureGenerations = {};
  const pendingEnableDisabled = {};

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
    // Mutual exclusion: shorts2long and sblock cannot both run.
    if (featureStates.shorts2long && featureStates.sblock) {
      featureStates.sblock = false;
    }
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
    // Mutual exclusion: prefer shorts2long when both are enabled in storage.
    const bothShortsEnabled = features.shorts2long !== false && features.sblock !== false;
    for (const feature of Object.keys(CONFIG.FEATURE_FILES)) {
      if (features[feature] !== false && isExtensionEnabled && !(bothShortsEnabled && feature === 'sblock')) {
        await enableFeature(feature);
      }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'ping') {
        // Respond to ping messages from popup.js
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
  }

  async function handleToggleExtension(enabled) {
    isExtensionEnabled = enabled;
    await toggleExtensionFeatures(enabled);
    const features = await chrome.storage.sync.get(Object.keys(CONFIG.FEATURE_FILES));
    const bothShortsEnabled = features.shorts2long !== false && features.sblock !== false;
    for (const feature of Object.keys(CONFIG.FEATURE_FILES)) {
      if (features[feature] !== false && isExtensionEnabled && !(bothShortsEnabled && feature === 'sblock')) {
        await enableFeature(feature);
      } else {
        await disableFeature(feature);
      }
    }
  }

  async function handleToggleFeature(feature, enabled) {
    if (enabled && isExtensionEnabled) {
      // Mutual exclusion: enabling one shorts feature disables the other.
      const conflictingFeature = feature === 'shorts2long' ? 'sblock'
        : feature === 'sblock' ? 'shorts2long' : null;
      if (conflictingFeature) {
        await disableFeature(conflictingFeature);
      }
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
      // Latest intent is disabled: drop any CSS/JS injected after the disable.
      // If a newer enable has started, it owns those elements — leave them.
      if (pendingEnableDisabled[feature]) {
        const css = injectedElements[feature]?.css || document.getElementById(`youtube-enhancer-${feature}-css`);
        const js = injectedElements[feature]?.js || document.getElementById(`youtube-enhancer-${feature}-script`);
        if (css) css.remove();
        if (js) js.remove();
        delete injectedElements[feature];
      }
      return true;
    };
    try {
      await waitForDocumentReady();
      if (bailIfCancelled()) return;
      await injectSettings();
      if (bailIfCancelled()) return;
      await injectCSS(feature);
      if (bailIfCancelled()) return;
      await loadFeatureJS(feature);
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
    // Remove injected script/link elements so a later re-enable starts clean.
    const css = injectedElements[feature]?.css || document.getElementById(`youtube-enhancer-${feature}-css`);
    const js = injectedElements[feature]?.js || document.getElementById(`youtube-enhancer-${feature}-script`);
    if (css) css.remove();
    if (js) js.remove();
    delete injectedElements[feature];
    console.log(`Disabled feature: ${feature}`);
  }

  function loadFeatureJS(feature) {
    return new Promise((resolve, reject) => {
      const scriptId = `youtube-enhancer-${feature}-script`;
      const existing = document.getElementById(scriptId);
      if (existing) {
        // Already injected; do not inject a duplicate.
        injectedElements[feature] = injectedElements[feature] || {};
        injectedElements[feature].js = existing;
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(CONFIG.FEATURE_FILES[feature].js);
      script.id = scriptId;
      script.onload = () => {
        console.log(`Loaded ${feature}.js`);
        injectedElements[feature] = injectedElements[feature] || {};
        injectedElements[feature].js = script;
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${feature}.js`));
      document.head.appendChild(script);
    });
  }

  async function injectCSS(feature) {
    await waitForDocumentReady();
    const existingLink = document.getElementById(`youtube-enhancer-${feature}-css`);
    if (existingLink) {
      injectedElements[feature] = injectedElements[feature] || {};
      injectedElements[feature].css = existingLink;
      return existingLink;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(CONFIG.FEATURE_FILES[feature].css);
    link.id = `youtube-enhancer-${feature}-css`;
    link.onload = () => console.log(`CSS loaded for ${feature}`);
    link.onerror = () => console.error(`CSS failed to load for ${feature}`);
    document.head.appendChild(link);
    injectedElements[feature] = injectedElements[feature] || {};
    injectedElements[feature].css = link;
    return link;
  }

  async function toggleExtensionFeatures(enabled) {
    await waitForDocumentReady();
    document.body.classList.toggle(CONFIG.CUSTOM_CLASS, enabled);
  }

  initialize();
})();
