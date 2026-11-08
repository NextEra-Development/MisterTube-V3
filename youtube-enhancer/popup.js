const CONFIG = {
    STATUS_UPDATE_DELAY: 2000,
    DEFAULT_ENABLED: true,
    ANIMATION_DURATION: 300,
    FEATURES: [
        "vid",
        "subsComment",
        "sblock",
        "thumbnails"
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

    // V2 pattern: popup writes storage, the background relays a tab reload
    // (if the user wants an immediate re-apply), and content.js picks up
    // the state via chrome.storage.onChanged (no tab messaging, no
    // chrome.scripting fallback — that fallback injected a lone content.js
    // without the feature registry and caused the "Receiving end does
    // not exist" / "Failed to inject" loop).
    function reloadYouTubeTabs() {
        try {
            chrome.runtime.sendMessage({ action: 'reloadYouTubeTabs' }, () => {
                void chrome.runtime.lastError;
            });
        } catch (_) { /* storage write already landed; reload is best-effort */ }
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

            await chrome.storage.sync.set(storageUpdate);

            // V2 bridge: content.js reacts via storage.onChanged (no reload
            // needed); background reload stays best-effort for stale tabs.
            reloadYouTubeTabs();

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

        // V2 bridge: content.js applies via storage.onChanged (no reload needed).
        reloadYouTubeTabs();

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