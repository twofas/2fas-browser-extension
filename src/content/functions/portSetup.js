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
  function portConnect (port) {
    return new Promise(resolve => {
      port = browser.runtime.connect({ name: '2FAS' });

      port._oM = function (msg, p) {
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
    });
  };

  while (true) {
    let p;
    p = await portConnect(p);
    p.onDisconnect.removeListener(p._resolve);
    p.onMessage.removeListener(p._oM);
    p._oM = undefined;
    p._resolve = undefined;
    p = undefined;
  }
};

module.exports = portSetup;
