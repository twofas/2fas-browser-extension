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

import isInFrame from '@content/functions/isInFrame.js';
import { createElement, createSVGElement, createTextElement } from '@partials/DOMElements';
import iconSrc from '@images/notification-logo.svg';
import S from '@/selectors.js';

const notification = request => {
  if (isInFrame()) {
    return false;
  }

  let n = {
    container: document.querySelector(S.notification.container),
    notification: null,
    firstCol: null,
    logo: null,
    secondCol: null,
    header: null,
    h3: null,
    notificationText: null,
    p: null
  };

  if (!n.container) {
    n.container = createElement('div', 'twofas-be-notifications');
    window.top.document.body.appendChild(n.container);
  }

  n.notification = createElement('div', 'twofas-be-notification');
  n.firstCol = createElement('div', 'twofas-be-col');
  n.logo = createSVGElement(iconSrc);

  n.firstCol.appendChild(n.logo);
  n.notification.appendChild(n.firstCol);

  n.secondCol = createElement('div', 'twofas-be-col');
  n.header = createElement('div', 'twofas-be-notification-header');
  n.h3 = createTextElement('h3', request.title);

  n.header.appendChild(n.h3);
  n.secondCol.appendChild(n.header);

  n.notificationText = createElement('div', 'twofas-be-notification-text');
  n.p = createTextElement('p', request.message);

  n.notificationText.appendChild(n.p);
  n.secondCol.appendChild(n.notificationText);
  n.notification.appendChild(n.secondCol);
  n.container.appendChild(n.notification);

  setTimeout(() => n.notification.classList.add('visible'), 300);

  window.addEventListener('beforeunload', () => {
    if (n && n.notification) {
      n.notification.classList.remove('visible');
    }

    setTimeout(() => {
      if (n && n.notification) {
        n.notification.classList.add('hidden');
        n = null;
      }
    }, 300);
  });

  if (request.timeout) {
    setTimeout(() => {
      if (n && n.notification) {
        n.notification.classList.remove('visible');
      }
    }, 5300);

    setTimeout(() => {
      if (n && n.notification) {
        n.notification.classList.add('hidden');
        n = null;
      }
    }, 5600);
  }
};

export default notification;
