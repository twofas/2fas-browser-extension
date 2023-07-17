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

/* global CustomEvent */
const S = require('../../selectors');
const setQRCode = require('./setQRCode');

const installContainerHandlers = (channel, imageURL, extensionID) => {
  const app = document.querySelector(S.installPage.container.app);
  const qr = document.querySelector(S.installPage.container.qr);
  let t;

  const installHandler = async function () {
    const step = this.dataset.step;
    app.classList.toggle('active');
    qr.classList.toggle('active');

    if (step === '1') {
      if (channel.ws.readyState === 1) {
        channel.ws.close();
        clearTimeout(t);
        t = undefined;

        const qrHiddenEvent = new CustomEvent('qrHidden');
        document.dispatchEvent(qrHiddenEvent);
      }
    } else {
      t = setQRCode(imageURL, channel, extensionID);
      channel.connect();
    }
  };

  app.classList.add('loaded');
  qr.classList.add('loaded');

  const btn = document.querySelectorAll(S.installPage.container.handler);
  
  if (btn) {
    btn.forEach(b => b.addEventListener('click', installHandler));
  }
};

module.exports = installContainerHandlers;
