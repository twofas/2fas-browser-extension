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

import browser from 'webextension-polyfill';
import storeLog from '@partials/storeLog.js';
import wait from '@partials/wait.js';

const GET_TAB_DATA_ATTEMPTS = 3;
const GET_TAB_DATA_RETRY_DELAY_MS = 150;

/**
 * Retrieves tab data from the background script.
 * Retries transient failures (e.g. service worker waking up) before giving up,
 * so callers do not act on a spurious null result.
 * @returns {Promise<Object>} Tab data object containing id, url, urlPath, and status.
 */
const getTabData = async () => {
  if (!browser?.runtime?.id) {
    throw new Error('Extension context invalidated');
  }

  let lastError;

  for (let attempt = 1; attempt <= GET_TAB_DATA_ATTEMPTS; attempt++) {
    try {
      return await browser.runtime.sendMessage({ action: 'getTabData' });
    } catch (err) {
      lastError = err;

      if (attempt < GET_TAB_DATA_ATTEMPTS && browser?.runtime?.id) {
        await wait(GET_TAB_DATA_RETRY_DELAY_MS * attempt);
      }
    }
  }

  const errorMessage = lastError?.message || lastError?.toString?.() || '';
  const isBenignRuntimeError = errorMessage.includes('Could not establish connection') ||
    errorMessage.includes('Receiving end does not exist') ||
    errorMessage.includes('Extension context invalidated') ||
    errorMessage.includes('Invalid call to runtime.sendMessage') ||
    errorMessage.includes('Tab not found') ||
    errorMessage.includes('The message port closed before a response was received');

  if (!isBenignRuntimeError) {
    await storeLog('error', 14, lastError, 'getTabData');
  }

  throw lastError;
};

export default getTabData;
