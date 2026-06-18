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

import config from '@/config.js';
import { loadFromLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';
import enqueueBrowserRegistration from './enqueueBrowserRegistration.js';

/**
 * Updates the browser extension registration with the 2FAS API when the extension version,
 * browser name, or browser version changes. The stable extension name (with its persisted
 * random ID suffix) is preserved across updates — it is only changed via extNameUpdate.
 *
 * The API delivery itself is durable: the change is handed to enqueueBrowserRegistration,
 * which retries across transient network failures, offline cold-starts and MV3
 * service-worker termination (backoff + alarm + 'online'/onStartup recovery), persists the
 * new browserInfo/version only on success, and escalates to a log only once a registration
 * is genuinely stuck. This function always resolves so the updateBrowserInfo chain
 * (updateIncognitoAccess) still runs.
 *
 * @param {Object} browserInfo - Browser info ({ name, browser_name, browser_version }) — `name`
 *                               is expected to already come from storage when present
 *                               (see getBrowserInfo()).
 * @returns {Promise<void>} A promise that resolves when the update has been queued/attempted.
 */
const updateBrowserExtension = async browserInfo => {
  let data;

  try {
    data = await loadFromLocalStorage(['extensionID', 'extensionVersion', 'browserInfo']);
  } catch (err) {
    return storeLog('error', 48, err, 'updateBrowserExtension - storage load');
  }

  if (!data?.extensionID || typeof data.extensionID !== 'string') {
    return storeLog(
      'warning',
      27,
      { message: 'Missing extensionID — skipping API call' },
      'updateBrowserExtension - guard'
    );
  }

  const storedBrowserInfo = data?.browserInfo;
  const versionChanged = data?.extensionVersion !== config.ExtensionVersion;
  const browserNameChanged = storedBrowserInfo?.browser_name !== browserInfo.browser_name;
  const browserVersionChanged = storedBrowserInfo?.browser_version !== browserInfo.browser_version;

  if (storedBrowserInfo && !versionChanged && !browserNameChanged && !browserVersionChanged) {
    data = null;
    return;
  }

  const payload = {
    name: browserInfo.name || storedBrowserInfo?.name,
    browser_name: browserInfo.browser_name || storedBrowserInfo?.browser_name,
    browser_version: browserInfo.browser_version || storedBrowserInfo?.browser_version
  };

  data = null;

  return enqueueBrowserRegistration({ op: 'update', payload })
    .catch(err => storeLog('error', 48, err, 'updateBrowserExtension - enqueue'));
};

export default updateBrowserExtension;
