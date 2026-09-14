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
import browser from 'webextension-polyfill';
import SDK from '@sdk';
import { loadFromLocalStorage } from '@localStorage';
import storeLog from '@partials/storeLog.js';
import removeDeviceFromDOM from '@optionsPage/functions/removeDeviceFromDOM.js';
import showConfirmModal from '@optionsPage/functions/showConfirmModal.js';
import TwoFasNotification from '@notification';
import isTransportError from '@partials/isTransportError.js';

/**
 * Handles the device removal process with confirmation modal and API call.
 *
 * @param {Event} e - The click event that triggered the removal
 * @returns {Promise<void>|void}
 */
const removeDevice = function (e) {
  e.preventDefault();
  e.stopPropagation();

  const el = this;
  const deviceID = el?.dataset?.deviceId;
  const deviceName = el?.dataset?.deviceName;

  if (!deviceID || !deviceName) {
    return storeLog('error', 31, new Error('Wrong deviceID or deviceName'), 'removeDevice')
      .then(() => TwoFasNotification.show(config.Texts.Error.RemoveDeviceBadData, null, true))
      .catch(() => {});
  }

  showConfirmModal(
    browser.i18n.getMessage('modalDisconnectDeviceHeader'),
    browser.i18n.getMessage('modalDisconnectDeviceText').replace('DEVICE_NAME', deviceName),
    () => {
      // Unpair on the server first, then let the background apply the local-cache
      // removal through the shared devices lock (it also re-derives `configured`).
      // The devices table is rendered from the API, not storage, so the row is
      // removed directly here rather than via storage.onChanged.
      return loadFromLocalStorage(['extensionID'])
        .then(data => new SDK().removePairedDevice(data.extensionID, deviceID))
        .then(() => browser.runtime.sendMessage({ action: 'updateList', list: 'devices', op: 'remove', deviceId: deviceID }))
        .then(res => {
          if (!res || res.status !== 'ok') {
            throw new Error('updateList remove device failed');
          }

          return removeDeviceFromDOM(deviceID);
        })
        .then(() => TwoFasNotification.show(config.Texts.Success.DeviceDisconnected))
        .catch(async err => {
          // A failed unpair over a dead connection is not ours to fix; the
          // "updateList remove device failed" protocol error below still is.
          if (!isTransportError(err)) {
            await storeLog('error', 22, err, 'removeDevice');
          }
          return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
        });
    }
  );
};

export default removeDevice;
