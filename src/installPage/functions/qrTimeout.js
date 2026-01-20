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
import TwoFasNotification from '@/notification';
import S from '@/selectors.js';

const TIMEOUT_MS = (1000 * 60 * config.WebSocketTimeout) - 100;

/**
 * Toggles timeout-related CSS classes on QR code elements.
 *
 * @param {NodeList} qrImages - Collection of QR code image elements
 * @param {NodeList} qrManuals - Collection of manual QR code elements
 * @param {NodeList} timeoutElements - Collection of timeout overlay elements
 * @param {boolean} isTimedOut - Whether to add (true) or remove (false) timeout classes
 */
const toggleTimeoutClasses = (qrImages, qrManuals, timeoutElements, isTimedOut) => {
  const action = isTimedOut ? 'add' : 'remove';

  qrImages.forEach(img => { img.classList[action]('twofas-qrcode-timeout'); });
  qrManuals.forEach(manual => { manual.classList[action]('twofas-manual-timeout'); });
  timeoutElements.forEach(el => { el.classList[action]('visible'); });
};

/**
 * Manages QR code timeout state and provides regeneration functionality.
 *
 * @param {NodeList} qrImages - Collection of QR code image elements
 * @param {Object} channel - WebSocket channel object with connect method
 * @returns {Function} Cleanup function to clear timeout and remove event listeners
 */
const qrTimeout = (qrImages, channel) => {
  let timeoutId = null;
  let currentBtnListener = null;

  const timeoutElements = document.querySelectorAll(S.installPage.qr.timeout);
  const qrManuals = document.querySelectorAll(S.installPage.qr.manual);

  toggleTimeoutClasses(qrImages, qrManuals, timeoutElements, false);

  const handleRegenerate = () => {
    clearTimeout(timeoutId);
    channel.connect();
    toggleTimeoutClasses(qrImages, qrManuals, timeoutElements, false);
    TwoFasNotification.clearAll();
    timeoutId = setTimeout(handleTimeout, TIMEOUT_MS);
  };

  const handleTimeout = () => {
    const regenerateBtns = document.querySelectorAll(S.installPage.qr.regenerate);

    toggleTimeoutClasses(qrImages, qrManuals, timeoutElements, true);

    if (regenerateBtns.length === 0) {
      return;
    }

    regenerateBtns.forEach(btn => {
      btn.removeEventListener('click', currentBtnListener);
      btn.addEventListener('click', handleRegenerate);
    });

    currentBtnListener = handleRegenerate;
  };

  const handleQrHidden = () => {
    cleanup();
  };

  const cleanup = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
    document.removeEventListener('qrHidden', handleQrHidden);

    if (currentBtnListener) {
      const regenerateBtns = document.querySelectorAll(S.installPage.qr.regenerate);

      regenerateBtns.forEach(btn => {
        btn.removeEventListener('click', currentBtnListener);
      });

      currentBtnListener = null;
    }
  };

  document.addEventListener('qrHidden', handleQrHidden);
  timeoutId = setTimeout(handleTimeout, TIMEOUT_MS);

  return cleanup;
};

export default qrTimeout;
