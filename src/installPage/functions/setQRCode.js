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

import S from '@/selectors.js';
import qrTimeout from '@installPage/functions/qrTimeout.js';

/**
 * Sets QR code image and manual extension ID, then initializes the QR timeout handler.
 * @param {string} imageURL - The QR code image data URL
 * @param {Object} channel - WebSocket channel object with connect method
 * @param {string} extensionID - The extension ID to display for manual pairing
 * @returns {number} Timeout ID from qrTimeout
 */
const setQRCode = (imageURL, channel, extensionID) => {
  const QRImgs = document.querySelectorAll(S.installPage.qr.imgs);
  const QRManuals = document.querySelectorAll(S.installPage.qr.manual);

  QRImgs.forEach(img => { img.src = imageURL; });
  QRManuals.forEach(manual => { manual.innerText = extensionID; });

  return qrTimeout(QRImgs, channel);
};

export default setQRCode;
