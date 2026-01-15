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

/* global CustomEvent */
import S from '@/selectors.js';
import setQRCode from '@installPage/functions/setQRCode.js';

/**
 * Closes WebSocket channel and dispatches qrHidden event.
 *
 * @param {Object} channel - WebSocket channel object with ws property
 * @param {Function|null} cleanupFn - Cleanup function from qrTimeout
 * @returns {null} Returns null to reset the cleanup reference
 */
const closeChannelAndCleanup = (channel, cleanupFn) => {
  channel.ws.close();

  if (typeof cleanupFn === 'function') {
    cleanupFn();
  }

  document.dispatchEvent(new CustomEvent('qrHidden'));

  return null;
};

/**
 * Sets up click handlers for toggling between app download and QR code views.
 *
 * @param {Object} channel - WebSocket channel object with ws property and connect method
 * @param {string} imageURL - Data URL of the QR code image
 * @param {string} extensionID - Unique identifier of the extension instance
 */
const installContainerHandlers = (channel, imageURL, extensionID) => {
  const app = document.querySelector(S.installPage.container.app);
  const qr = document.querySelector(S.installPage.container.qr);
  let cleanupQrTimeout = null;

  const installHandler = event => {
    const step = event.currentTarget.dataset.step;

    app.classList.toggle('active');
    qr.classList.toggle('active');

    if (step === '1') {
      if (channel.ws.readyState === WebSocket.OPEN) {
        cleanupQrTimeout = closeChannelAndCleanup(channel, cleanupQrTimeout);
      }
    } else {
      cleanupQrTimeout = setQRCode(imageURL, channel, extensionID);
      channel.connect();
    }
  };

  app.classList.add('loaded');
  qr.classList.add('loaded');

  document
    .querySelectorAll(S.installPage.container.handler)
    .forEach(btn => btn.addEventListener('click', installHandler));
};

export default installContainerHandlers;
