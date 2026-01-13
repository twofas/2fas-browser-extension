//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage';
import storeLog from '@partials/storeLog.js';
import removeDeviceFromDOM from '@optionsPage/functions/removeDeviceFromDOM.js';
import showConfirmModal from '@optionsPage/functions/showConfirmModal.js';
import TwoFasNotification from '@notification';

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
      let storage;

      return loadFromLocalStorage(['extensionID', 'devices'])
        .then(data => {
          storage = data;
          return new SDK().removePairedDevice(storage.extensionID, deviceID)
        })
        .then(() => {
          if (!storage || !storage.devices) {
            return [];
          }

          return storage.devices.filter(device => device.device_id !== deviceID)
        })
        .then(devices => {
          let configured = true;
          if (devices.length <= 0) {
            configured = false;
          }

          return saveToLocalStorage({ devices, configured }, storage);
        })
        .then(() => removeDeviceFromDOM(deviceID))
        .then(() => TwoFasNotification.show(config.Texts.Success.DeviceDisconnected))
        .catch(async err => {
          await storeLog('error', 22, err, 'removeDevice');
          return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
        });
    }
  );
}

export default removeDevice;
