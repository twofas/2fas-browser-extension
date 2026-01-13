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

const qrTimeout = (QRImgs, channel) => {
  let t;
  const timeoutElements = document.querySelectorAll(S.installPage.qr.timeout);
  const QRManuals = document.querySelectorAll(S.installPage.qr.manual);
  
  if (timeoutElements) {
    timeoutElements.forEach(el => { el.classList.remove('visible'); });
  }

  if (QRManuals) {
    QRManuals.forEach(manual => { manual.classList.remove('twofas-manual-timeout') });
  }
  
  if (QRImgs) {
    QRImgs.forEach(img => { img.classList.remove('twofas-qrcode-timeout'); });
  }

  const btnListener = () => {
    clearTimeout(t);

    channel.connect();
    
    if (QRImgs) {
      QRImgs.forEach(img => { img.classList.remove('twofas-qrcode-timeout'); });
    }

    if (QRManuals) {
      QRManuals.forEach(manual => { manual.classList.remove('twofas-manual-timeout') });
    }

    if (timeoutElements) {
      timeoutElements.forEach(el => { el.classList.remove('visible'); });
    }

    TwoFasNotification.clearAll();
    
    t = setTimeout(timeout, (1000 * 60 * config.WebSocketTimeout) - 100);
  };

  const timeout = () => {
    const regenerateQRBtns = document.querySelectorAll(S.installPage.qr.regenerate);

    if (QRImgs) {
      QRImgs.forEach(img => { img.classList.add('twofas-qrcode-timeout'); });
    }

    if (QRManuals) {
      QRManuals.forEach(manual => { manual.classList.add('twofas-manual-timeout') });
    }

    if (timeoutElements) {
      timeoutElements.forEach(el => { el.classList.add('visible'); });
    }

    if (!regenerateQRBtns) {
      return false;
    }

    regenerateQRBtns.forEach(btn => {
      const btnClone = btn.cloneNode(true);
      btn.parentNode.replaceChild(btnClone, btn);
      btnClone.addEventListener('click', btnListener);
    });
  };

  t = setTimeout(timeout, (1000 * 60 * config.WebSocketTimeout) - 100);

  document.addEventListener('qrHidden', () => {
    clearTimeout(t);
    t = undefined;
  });

  return t;
};

export default qrTimeout;
