# Chrome Web Store — preparation

Updated on 2026-09-21. Status: local development; not ready for submission.

## Listing

Name: YouTube Auto Fullscreen. Local version: 0.1.5. Current description: automatically opens eligible YouTube videos and live streams in fullscreen while respecting manual exit and the global preference. Store copy, category, icons, and screenshots remain to be prepared after manual platform validation.

## Permissions and access

Only the `storage` permission is requested, to retain the global preference and recoverable temporary operation state in the browser. Content scripts are limited to `https://youtube.com/*` and `https://www.youtube.com/*`. There are no `host_permissions`, `externally_connectable`, or `web_accessible_resources`.

The content script detects an eligible player and applies reversible presentation styles after worker confirmation. The popup reads and changes the preference without accessing storage directly. The worker stores only local data and can request fullscreen for the active window. The extension has no data transmission, analytics, server, or remote code.

The current E2E runner opens the packaged popup page to validate its interface, but does not reproduce the sender from a browser-action popup. Changing the preference is covered by contract unit tests and still requires manual Chrome acceptance.

## Distribution and privacy

Distribution is local for development. The final privacy policy, public URL, publisher name, contact information, regions, and visibility are pending. The implementation does not infer personal data and has no collection, analytics, server, or remote code.

## Version history

| Version | Delivery                                                                                              | Status               |
| ------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| 0.1.5   | Recover extension-owned presentation after worker wake and hide current recommendation card variants. | Local, not submitted |
| 0.1.4   | Hide recommendation overlays and restore presentation after page reload.                              | Local, not submitted |
| 0.1.3   | English-only popup and removed unused locale assets.                                                  | Local, not submitted |
| 0.1.2   | Immediate player recalculation for smoother presentation.                                             | Local, not submitted |
| 0.1.1   | Fullscreen presentation and cross-video resumption fixes.                                             | Local, not submitted |
| 0.1.0   | Foundation, preference, integrated flow, and controlled E2E.                                          | Local, not submitted |

## Pending work

Manual macOS/Windows acceptance, assets, the project license, and final store materials remain pending. There has been no store submission or review.
