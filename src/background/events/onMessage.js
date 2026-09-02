//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2026 Two Factor Authentication Service, Inc.
//  Contributed by Grzegorz Zając. All rights reserved.
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program. If not, see <https://www.gnu.org/licenses/>
//

/* global URL */
import browser from 'webextension-polyfill';
import getBrowserInfo from '@background/functions/getBrowserInfo.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import handleUpdateList from '@background/functions/updateListAction.js';
import storeLog from '@partials/storeLog.js';
import TwoFasNotification from '@notification/index.js';
import SDK, { LOG_LEVELS } from '@sdk/index.js';
import { loadFromLocalStorage } from '@localStorage/index.js';
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';
import { REGISTRATION_STORAGE_KEY } from '@background/functions/update/registrationRetryPolicy.js';
import isRegistrationPending from '@partials/registrationPending.js';

// Log 71 answers one bounded question: does any shipped Safari build deliver runtime
// messages without `MessageSender.url`? One answer per browser session is plenty.
// The flag lives in storage.session on purpose: storage.local is wiped by the very
// storageReset this accompanies, so a local flag would be gone before the second
// reset and the entry would repeat.
const TAB_URL_FALLBACK_FLAG = 'storageResetTabUrlFallbackReported';

/**
 * Reports the sender-guard tab-url fallback at most once per browser session.
 *
 * @async
 * @returns {Promise<void>}
 */
const reportTabUrlFallback = async () => {
  const flagged = await loadFromSessionStorage(TAB_URL_FALLBACK_FLAG);

  if (flagged?.[TAB_URL_FALLBACK_FLAG]) {
    return;
  }

  // Set first: storeLog can take a network round-trip, and a second reset arriving
  // meanwhile must not slip past the guard.
  await saveToSessionStorage({ [TAB_URL_FALLBACK_FLAG]: true });
  await storeLog('warning', 71, new Error('storageReset accepted via the tab-url fallback (sender.url absent)'), 'storageReset');
};

/**
 * Whether a message comes from one of the extension's own pages (options /
 * install page). Primary check: `sender.url` under the extension's base URL.
 * Fallback for a bridge that omits `sender.url` (older Safari): the sender must
 * carry the extension id and sit in a tab whose url is an extension page — a
 * content script's tab is the web page. Content scripts with a url never pass.
 *
 * @param {Object} sender - runtime.onMessage sender.
 * @returns {{ allowed: boolean, viaTabUrl: boolean }}
 */
const classifySender = sender => {
  const base = browser.runtime.getURL('');

  if (typeof sender?.url === 'string') {
    return { allowed: sender.url.startsWith(base), viaTabUrl: false };
  }

  const viaTabUrl = sender?.id === browser.runtime.id &&
    typeof sender?.tab?.url === 'string' &&
    sender.tab.url.startsWith(base);

  return { allowed: viaTabUrl, viaTabUrl };
};

/**
 * Handles messages from content scripts and other extension pages.
 * @param {Object} request - The message request object.
 * @param {Object} sender - Information about the message sender.
 * @param {Function} sendResponse - Function to send a response.
 * @return {boolean} Always returns true for async response handling.
 */
const onMessage = (request, sender, sendResponse) => {
  try {
    if (!request || !request.action) {
      sendResponse({ status: 'error' });
      return true;
    }

    switch (request.action) {
      case 'getTabData': {
        if (!sender?.tab?.id) {
          sendResponse({ status: 'No tabID' });
          return true;
        }

        const url = sender?.tab?.url || sender.url;
        let urlPath;

        try {
          urlPath = new URL(url);
          urlPath = `${urlPath.protocol}//${urlPath.host}${urlPath.pathname}`;
        } catch (err) {
          urlPath = url;
        }

        sendResponse({
          id: sender?.tab?.id,
          url: sender?.tab?.url,
          urlPath,
          status: sender?.tab?.status
        });

        break;
      }

      case 'getSessionTabData': {
        if (!sender?.tab?.id) {
          sendResponse({ status: 'error', message: 'No tabID' });
          return true;
        }

        loadFromSessionStorage([`tabData-${sender.tab.id}`])
          .then(data => {
            sendResponse({ status: 'ok', data });
          })
          .catch(() => {
            sendResponse({ status: 'error' });
          });

        break;
      }

      case 'storageReset': {
        // Only the extension's OWN pages (options / install page) may mint a new
        // identity. Content scripts also carry the extension id, but their `url`
        // is the web page they run in.
        const senderCheck = classifySender(sender);

        if (!senderCheck.allowed) {
          sendResponse({ status: 'error', message: 'Forbidden' });
          break;
        }

        if (senderCheck.viaTabUrl) {
          // Telemetry only: tells us whether any shipped Safari build lacks sender.url.
          reportTabUrlFallback().catch(() => {});
        }

        loadFromLocalStorage(['keys', 'extensionID', REGISTRATION_STORAGE_KEY])
          .then(current => {
            // Keys written, create POST still owned by the durable retry: regenerating
            // would throw that record away, mint another keypair and bump `attempt`.
            // Tell the page to wait instead of reloading into another reset.
            if (isRegistrationPending(current)) {
              sendResponse({ status: 'pending' });
              return null;
            }

            return getBrowserInfo({ force: true })
              .then(browserInfo => generateDefaultStorage(browserInfo))
              // generateDefaultStorage swallows its own failures (it defers a failed
              // registration to the durable retry and logs everything else), so a
              // resolved promise is NOT proof that storage was rebuilt. Confirm the
              // keys exist before answering `ok` — otherwise the page reloads into an
              // empty storage and asks for the same reset again, forever.
              .then(() => loadFromLocalStorage(['keys', 'extensionID', REGISTRATION_STORAGE_KEY]))
              .then(fresh => {
                if (!fresh?.keys?.publicKey) {
                  throw new Error('storageReset left no key material');
                }

                if (fresh?.extensionID) {
                  sendResponse({ status: 'ok', pending: false });
                  return;
                }

                if (isRegistrationPending(fresh)) {
                  // Regenerated, but the POST has not landed and the durable retry now
                  // owns it. Still a success for a user who clicked "Reset"; the flag
                  // lets the page bootstraps skip a reload that would only show a
                  // pairing page with no extensionID yet.
                  sendResponse({ status: 'ok', pending: true });
                  return;
                }

                // Keys but neither an extensionID nor a retry record: the registration
                // failed deterministically (a 4xx the backoff would never clear), so
                // nothing will finish this reset. Answering `ok` sent the page into
                // another reset, and another, until the attempt bound tripped.
                throw new Error('storageReset could not register the new identity');
              });
          })
          .catch(err => {
            storeLog('error', 37, err, 'storageReset')
              .finally(() => {
                sendResponse({ status: 'error' });
              });
          });

        break;
      }

      case 'updateList': {
        // Same authorization as storageReset: this mutates persisted user state
        // (paired devices, excluded domains) and is only ever sent by the options
        // page. A content script must not be able to reach it.
        if (!classifySender(sender).allowed) {
          sendResponse({ status: 'error', message: 'Forbidden' });
          break;
        }

        if (!request?.list || !request?.op) {
          sendResponse({ status: 'error', message: 'Invalid updateList request' });
          return true;
        }

        handleUpdateList(request)
          .then(result => {
            sendResponse({ status: 'ok', ...result });
          })
          .catch(err => {
            storeLog('error', 53, err, 'updateList')
              .finally(() => {
                sendResponse({ status: 'error' });
              });
          });

        break;
      }

      case 'storeLogEvent': {
        // Backend log proxied from a content script (storeLog partial): the
        // background signs the store_log request with the extension's signing
        // key — content scripts cannot. The payload arrives pre-sanitized and
        // pre-debounced by the sender's storeLog.
        if (!LOG_LEVELS.includes(request?.level) || typeof request?.message !== 'string') {
          sendResponse({ status: 'error', message: 'Invalid storeLogEvent request' });
          return true;
        }

        loadFromLocalStorage(['extensionID', 'logging'])
          .then(storage => {
            if (!storage?.logging || !storage?.extensionID) {
              return null;
            }

            return new SDK().storeLog(storage.extensionID, request.level, request.message, request.context);
          })
          .then(() => {
            sendResponse({ status: 'ok' });
          })
          .catch(err => {
            // Never route this failure back into storeLog — it would loop.
            console.error('onMessage - storeLogEvent', err);
            sendResponse({ status: 'error' });
          });

        break;
      }

      case 'notificationOnBackground': {
        if (!request?.data) {
          sendResponse({ status: 'No data' });
          return true;
        }

        TwoFasNotification.show(request.data, request.tabID)
          .then(() => {
            sendResponse({ status: 'ok' });
          })
          .catch(() => {
            sendResponse({ status: 'error' });
          });

        break;
      }

      case 'clearLastFocusedInput': {
        if (!sender?.tab?.id) {
          sendResponse({ status: 'error', message: 'No tabID' });
          return true;
        }

        const tabId = sender.tab.id;

        loadFromSessionStorage([`tabData-${tabId}`])
          .then(sessionData => {
            const tabData = sessionData[`tabData-${tabId}`] || {};

            if (tabData.lastFocusedInput || typeof tabData.lastFocusedFrameId === 'number') {
              delete tabData.lastFocusedInput;
              delete tabData.lastFocusedFrameId;
              delete tabData.lastFocusedFrameOrigin;
              delete tabData.lastFocusedFrameUrl;
              return saveToSessionStorage({ [`tabData-${tabId}`]: tabData });
            }

            return true;
          })
          .then(() => {
            sendResponse({ status: 'ok' });
          })
          .catch(() => {
            sendResponse({ status: 'error' });
          });

        break;
      }

      default: {
        sendResponse({ status: 'Empty action' });
        break;
      }
    }
  } catch (err) {
    sendResponse({ status: 'error', message: 'Unknown error' });
  }

  return true;
};

export default onMessage;
