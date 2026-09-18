// A read-only bootstrap probe. Functional message contracts belong to S01.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    sender.id !== chrome.runtime.id ||
    message?.type !== 'foundation:status'
  ) {
    return false;
  }
  sendResponse({ ready: true, version: chrome.runtime.getManifest().version });
  return false;
});
