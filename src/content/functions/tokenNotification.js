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
import isInFrame from '@content/functions/isInFrame.js';
import { createElement, createSVGElement, createTextElement } from '@partials/DOMElements';
import iconSrc from '@images/notification-logo.svg';
import copySrc from '@images/copy-icon.svg';
import closeSrc from '@images/notification-close.svg';
import S from '@/selectors.js';

let lastTokenNotificationToken = null;

/**
 * Displays a notification with the 2FA token and a copy button.
 *
 * @param {string} token - The 2FA token to display
 * @returns {boolean} False if running in a frame or duplicate, otherwise undefined
 */
const tokenNotification = token => {
  if (isInFrame()) {
    return false;
  }

  if (token === lastTokenNotificationToken) {
    return false;
  }

  lastTokenNotificationToken = token;

  let n = {
    container: document.querySelector(S.notification.container),
    notification: null,
    firstCol: null,
    logo: null,
    secondCol: null,
    header: null,
    h3: null,
    tokenBox: null,
    tokenText: null,
    tokenIconContainer: null,
    tokenIcon: null,
    tokenButton: null,
    tokenButtonText: null,
    notificationText: null,
    p: null,
    closeBtn: null,
    close: null
  };

  const closeNotification = e => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (n && n.notification) {
      n.notification.classList.remove('visible');
    }

    setTimeout(() => {
      if (n && n.notification) {
        n.notification.classList.add('hidden');
        n = null;
      }
    }, 300);
  };

  if (!n.container) {
    n.container = createElement('div', 'twofas-be-notifications');
    window.top.document.body.appendChild(n.container);
  }

  n.notification = createElement('div', 'twofas-be-notification');
  n.closeBtn = createElement('button', 'twofas-be-notification-close');
  n.closeBtn.addEventListener('click', closeNotification);
  n.close = createSVGElement(closeSrc);
  n.closeBtn.appendChild(n.close);
  n.notification.appendChild(n.closeBtn);

  n.firstCol = createElement('div', 'twofas-be-col');
  n.logo = createSVGElement(iconSrc);

  n.firstCol.appendChild(n.logo);
  n.notification.appendChild(n.firstCol);

  n.secondCol = createElement('div', 'twofas-be-col');
  n.header = createElement('div', 'twofas-be-notification-header');
  n.h3 = createTextElement('h3', config.Texts.Token.Header);

  n.header.appendChild(n.h3);
  n.secondCol.appendChild(n.header);

  n.tokenBox = createElement('div', 'twofas-be-notification-token-box');
  n.tokenText = createTextElement('p', token, 'twofas-be-notification-token-box-text');
  n.tokenButton = createElement('button', 'twofas-be-notification-token-box-copy-button');
  n.tokenButton.addEventListener('click', () => {
    navigator.clipboard.writeText(token);
    n.tokenButtonText.innerText = config.Texts.Token.Copied;

    setTimeout(() => {
      n.tokenButtonText.innerText = config.Texts.Token.Copy;
    }, 1000);
  });
  n.tokenButtonText = createTextElement('span', config.Texts.Token.Copy);
  n.tokenIconContainer = createElement('div', 'twofas-be-notification-token-box-copy-icon');
  n.tokenIcon = createSVGElement(copySrc);

  n.tokenButton.appendChild(n.tokenButtonText);
  n.tokenIconContainer.appendChild(n.tokenIcon);
  n.tokenButton.appendChild(n.tokenIconContainer);
  n.tokenBox.appendChild(n.tokenText);
  n.tokenBox.appendChild(n.tokenButton);
  n.secondCol.appendChild(n.tokenBox);

  n.notificationText = createElement('div', 'twofas-be-notification-text');
  n.p = createTextElement('p', config.Texts.Token.Description);

  n.notificationText.appendChild(n.p);
  n.secondCol.appendChild(n.notificationText);
  n.notification.appendChild(n.secondCol);
  n.container.appendChild(n.notification);

  setTimeout(() => n.notification.classList.add('visible'), 300);

  window.addEventListener('beforeunload', () => {
    closeNotification();
  });

  setTimeout(() => {
    if (n && n.notification) {
      n.notification.classList.remove('visible');
    }
  }, 30300);

  setTimeout(() => {
    if (n && n.notification) {
      n.notification.classList.add('hidden');
      n = null;
    }
  }, 30600);
};

export default tokenNotification;
