const CONFIG = {
    STATUS_UPDATE_DELAY: 2000,
    DEFAULT_ENABLED: true,
    ANIMATION_DURATION: 300,
    FEATURES: [
        "vid",
        "shorts2long",
        "subsComment",
        "sblock"
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('currentYear').textContent = new Date().getFullYear();

    const toggle = document.getElementById('toggleSwitch');
    const statusText = document.getElementById('statusText');
    const container = document.querySelector('.container');
    const settingsIcon = document.getElementById('openSettings');
    const settingsPanel = document.getElementById('settings');

    settingsPanel.style.display = 'none';

    let isProcessingAction = false;

    settingsIcon.addEventListener('click', () => {
        if (settingsPanel.style.display === 'none') {
            settingsPanel.style.display = 'block';
            loadFeatureStates();
        } else {
            settingsPanel.style.display = 'none';
        }
    });

    function loadFeatureStates() {
        // Get feature toggles
        const featureToggles = document.querySelectorAll('.feature-toggle');
        featureToggles.forEach(toggle => {
            const feature = toggle.dataset.feature;
            chrome.storage.sync.get([feature], (result) => {
                toggle.checked = result[feature] !== false;
                toggle.disabled = !isExtensionEnabled;
            });
        });
    }

    // Function to check if content script is loaded
    async function isContentScriptLoaded(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            return true;
        } catch (error) {
            return false;
        }
    }

    // Function to inject content script with retry
    async function injectContentScript(tabId, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                });
                // Wait for script to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
                if (await isContentScriptLoaded(tabId)) {
                    return true;
                }
            } catch (error) {
                console.warn(`Injection attempt ${i + 1} failed:`, error);
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 200 * (i + 1)));
            }
        }
        return false;
    }

    // Function to send message to content script with error handling
    async function sendMessageToContentScript(tabId, message) {
        try {
            // Check if we have permission to access the tab
            const tab = await chrome.tabs.get(tabId);
            if (!tab) {
                throw new Error('Tab not found');
            }

            // First attempt to send message
            await chrome.tabs.sendMessage(tabId, message);
        } catch (error) {
            console.warn('Initial message send failed:', error);

            // If content script is not loaded, try to inject it
            if (error.message.includes('Receiving end does not exist')) {
                try {
                    const injected = await injectContentScript(tabId);
                    if (!injected) {
                        throw new Error('Failed to inject content script');
                    }
                    // Retry sending the message after successful injection
                    await chrome.tabs.sendMessage(tabId, message);
                } catch (injectError) {
                    console.error('Error injecting content script:', injectError);
                    updateStatus(statusText, 'Error initializing extension', 'error');
                    throw injectError;
                }
            } else {
                updateStatus(statusText, 'Error communicating with page', 'error');
                throw error;
            }
        }
    }

    // Toggle event handlers for feature toggles
    document.querySelectorAll('.feature-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            if (isProcessingAction) return;
            isProcessingAction = true;
            try {

            const feature = e.target.dataset.feature;
            const isEnabled = e.target.checked;

            console.log(`Toggle ${feature}:`, isEnabled);

            const storageUpdate = {};
            storageUpdate[feature] = isEnabled;

            // Mutual exclusion: shorts2long and sblock cannot both be enabled
            const conflictingFeature = feature === 'shorts2long' ? 'sblock'
                : feature === 'sblock' ? 'shorts2long' : null;
            let conflictDisabled = false;
            if (isEnabled && conflictingFeature) {
                storageUpdate[conflictingFeature] = false;
                conflictDisabled = true;
            }

            await chrome.storage.sync.set(storageUpdate);

            if (conflictDisabled) {
                const conflictToggle = document.querySelector(`.feature-toggle[data-feature="${conflictingFeature}"]`);
                if (conflictToggle) conflictToggle.checked = false;
            }

            // Send message to content script with error handling
            const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
            for (const tab of tabs) {
                try {
                    await sendMessageToContentScript(tab.id, {
                        action: 'toggleFeature',
                        feature: feature,
                        enabled: isEnabled
                    });
                    if (conflictDisabled) {
                        await sendMessageToContentScript(tab.id, {
                            action: 'toggleFeature',
                            feature: conflictingFeature,
                            enabled: false
                        });
                    }
                } catch (tabError) {
                    console.warn(`Failed to update tab ${tab.id}:`, tabError);
                    continue;
                }
            }

            const featureName = document.querySelector(`.feature-card.${feature} .feature-title`)?.textContent || feature;
            updateStatus(
                statusText,
                `${featureName} ${isEnabled ? 'enabled' : 'disabled'}`,
                'success'
            );

            setTimeout(() => {
                updateStatus(
                    statusText,
                    isExtensionEnabled ? 'Extension is Active 🟢' : 'Extension is Inactive 🔴',
                    isExtensionEnabled ? 'active' : 'inactive'
                );
            }, CONFIG.STATUS_UPDATE_DELAY);

            } finally {
                isProcessingAction = false;
            }
        });
    });

    // Main extension toggle handler
    toggle.addEventListener('change', async () => {
        if (isProcessingAction) return;
        isProcessingAction = true;
        try {

        const isEnabled = toggle.checked;
        applyPulseAnimation(container);

        await chrome.storage.sync.set({ extensionEnabled: isEnabled });
        isExtensionEnabled = isEnabled;

        // Update feature toggle states
        document.querySelectorAll('.feature-toggle').forEach(toggle => {
            toggle.disabled = !isEnabled;
        });

        updateStatus(
            statusText,
            isEnabled ? 'Extension is Active 🟢' : 'Extension is Inactive 🔴',
            isEnabled ? 'active' : 'inactive'
        );

        // Send message to content script with error handling
        const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
        for (const tab of tabs) {
            try {
                await sendMessageToContentScript(tab.id, {
                    action: 'toggleExtension',
                    enabled: isEnabled
                });
            } catch (tabError) {
                console.warn(`Failed to update tab ${tab.id}:`, tabError);
                continue;
            }
        }

        } finally {
            isProcessingAction = false;
        }
    });

    checkYouTubeTab()
        .then(isYouTube => {
            if (!isYouTube) {
                disableControls(toggle);
                updateStatus(statusText, 'Open YouTube to use this extension', 'warning');
                return;
            }

            initializeExtensionState(toggle, statusText);
        })
        .catch(error => {
            console.error('Tab access error:', error);
            disableControls(toggle);
            updateStatus(statusText, 'Error accessing tab information', 'error');
        });

});

// Track global extension state
let isExtensionEnabled = true;

async function checkYouTubeTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        return !!tab?.url?.match(/^https?:\/\/(www\.)?youtube\.com/);
    } catch (error) {
        console.error('Tab check error:', error);
        return false;
    }
}

function initializeExtensionState(toggle, statusText) {
    toggle.disabled = false;

    // Get extension state from storage
    chrome.storage.sync.get(['extensionEnabled'], (result) => {
        isExtensionEnabled = result.extensionEnabled !== false;
        toggle.checked = isExtensionEnabled;
        updateStatus(
            statusText,
            isExtensionEnabled ? 'Extension is Active 🟢' : 'Extension is Inactive 🔴',
            isExtensionEnabled ? 'active' : 'inactive'
        );
    });
}

function updateStatus(statusElement, message, type) {
    statusElement.classList.remove('status-active', 'status-inactive', 'status-warning', 'status-error', 'status-success', 'status-processing');
    statusElement.classList.add(`status-${type}`);
    statusElement.style.opacity = '0';
    setTimeout(() => {
        statusElement.textContent = message;
        statusElement.style.opacity = '1';
    }, 150);
}

function disableControls(toggle) {
    toggle.disabled = true;
    toggle.classList.add('disabled');
}

function applyPulseAnimation(element) {
    element.classList.add('pulse');
    setTimeout(() => {
        element.classList.remove('pulse');
    }, CONFIG.ANIMATION_DURATION);
}