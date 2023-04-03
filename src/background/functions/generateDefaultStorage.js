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

const config = require('../../config');
const browser = require('webextension-polyfill');
const { clearLocalStorage, saveToLocalStorage } = require('../../localStorage');
const SDK = require('../../sdk');
const Crypt = require('./Crypt');
const storeLog = require('../../partials/storeLog');

const generateDefaultStorage = browserInfo => {
  const crypt = new Crypt();

  return clearLocalStorage()
    .then(() => crypt.generateKeys())
    .then(keys => Promise.all([
      crypt.exportKey('spki', keys.publicKey),
      crypt.exportKey('pkcs8', keys.privateKey)
    ]))
    .then(data => {
      const keys = {
        publicKey: crypt.ArrayBufferToString(data[0]),
        privateKey: crypt.ArrayBufferToString(data[1])
      };

      return saveToLocalStorage({
        configured: false,
        browserInfo,
        keys,
        logging: false,
        notifications: false,
        incognito: false,
        nativePush: (process.env.EXT_PLATFORM !== 'Safari'),
        pinInfo: false,
        extensionVersion: config.ExtensionVersion
      });
    })
    .then(storage => {
      const extensionInstanceBody = structuredClone(browserInfo);
      extensionInstanceBody.public_key = storage.keys.publicKey;

      return new SDK().createExtensionInstance(extensionInstanceBody)
    })
    .then(data => saveToLocalStorage({ extensionID: data.id }))
    .then(storage => {
      if (process.env.EXT_PLATFORM === 'Safari') {
        return Promise.resolve();
      }

      return browser.runtime.setUninstallURL(`https://2fas.com/byebye/${storage.extensionID}/`);
    })
    .catch(err => storeLog('error', 28, err, 'generateDefaultStorage'));
};

module.exports = generateDefaultStorage;
