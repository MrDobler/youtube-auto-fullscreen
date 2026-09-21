import { createApplication } from '../application/application.js';
import { createChromeAdapters } from '../platform/chrome/adapters.js';

const chromeApi = chrome;
const application = createApplication({
  adapters: createChromeAdapters(chromeApi),
});

// MV3 listeners are deliberately registered before asynchronous initialization.
chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.type === 'foundation:status' &&
    sender.id === chromeApi.runtime.id
  ) {
    sendResponse({
      ready: true,
      version: chromeApi.runtime.getManifest().version,
    });
    return false;
  }
  void application.receiveMessage(message, sender).then(
    (response) => {
      if (response !== null) sendResponse(response);
    },
    () => {},
  );
  return true;
});

chromeApi.tabs.onActivated.addListener(() => {
  void application.refreshKnownContexts();
});
chromeApi.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'loading') void application.refreshKnownContexts();
});
chromeApi.tabs.onRemoved.addListener((tabId) => {
  void application.removeTab(tabId);
});
chromeApi.windows.onFocusChanged.addListener(() => {
  void application.refreshKnownContexts();
});

void application.initialize();
