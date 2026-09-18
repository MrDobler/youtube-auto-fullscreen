/** Confirm that the packaged content script can reach the extension worker. */
async function initializeContent() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'foundation:status',
    });
    if (response?.ready !== true) {
      throw new Error('Worker unavailable');
    }
    console.debug('YouTube Auto Fullscreen: content ready');
  } catch {
    console.warn('YouTube Auto Fullscreen: initialization unavailable');
  }
}

void initializeContent();
