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

const browser = require('webextension-polyfill');

const portSetup = async () => {
  const portConnect = () => {
    return new Promise(resolve => {
      const port = browser.runtime.connect({ name: '2FAS' });

      port._oM = (msg, p) => {
        setTimeout(() => {
          try {
            return p.postMessage({ msg: 'ping' });
          } catch (e) {}
        }, 10000);
      };

      port.onMessage.addListener(port._oM);
      port._resolve = resolve;
      port.onDisconnect.addListener(port._resolve);
      port.postMessage({ msg: 'ping' });

      return port;
    });
  };

  while (true) {
    const port = await portConnect();

    port.onDisconnect.removeListener(port._resolve);
    port.onMessage.removeListener(port._oM);
    port._oM = null;
    port._resolve = null;
  }
};

module.exports = portSetup;
