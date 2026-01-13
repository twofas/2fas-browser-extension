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
import configurationComplete from '@/installPage/functions/configurationComplete.js';
import TwoFasNotification from '@notification/index.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';

const handleConfigurationRequest = (tabID, data) => {
  return loadFromLocalStorage(['configured', 'devices'])
    .then(storage => {
      if (!storage.configured) {
        return saveToLocalStorage({ configured: true }, storage);
      }

      return storage;
    })
    .then(storage => {
      let devices = [];
      let exist = false;
      const { device_id, device_public_key } = data; // eslint-disable-line camelcase

      if (storage.devices) {
        devices = storage.devices;
      }

      devices.map(device => {
        if (device.device_id === device_id) { // eslint-disable-line camelcase
          exist = true;
        }

        return device;
      });

      if (!exist) {
        devices.push({ device_id, device_public_key }); // eslint-disable-line camelcase
        return saveToLocalStorage({ devices }, storage);
      }

      return storage;
    })
    .then(configurationComplete)
    .catch(async err => {
      await storeLog('error', 7, err, 'configurationRequest');
      return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
    });
};

export default handleConfigurationRequest;
