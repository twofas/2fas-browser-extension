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

import browser from 'webextension-polyfill';
import { createElement, createTextElement, createSVGElement } from '@partials/DOMElements';
import iconSrc from '@images/notification-logo.svg';
import config from '@/config.js';
import closeNotificationInfo from '@content/functions/closeNotificationInfo.js';
import neverShowNotificationInfo from '@content/functions/neverShowNotificationInfo.js';
import isInFrame from '@content/functions/isInFrame.js';
import openOptionsPage from '@content/functions/openOptionsPage.js';
import S from '@/selectors.js';

const showNotificationInfo = () => {
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
    p: null,
    a: null,
    dot: null,
    buttonsContainer: null,
    buttonNever: null,
    buttonClose: null
  };

  if (!n.container) {
    n.container = createElement('div', 'twofas-be-notifications');
    window.top.document.body.appendChild(n.container);
  }

  if (document.querySelectorAll(S.notification.visible).length > 0) {
    return false;
  }

  n.notification = createElement('div', 'twofas-be-notification');
  n.firstCol = createElement('div', 'twofas-be-col');
  n.logo = createSVGElement(iconSrc);

  n.firstCol.appendChild(n.logo);
  n.notification.appendChild(n.firstCol);

  n.secondCol = createElement('div', 'twofas-be-col');
  n.header = createElement('div', 'twofas-be-notification-header');
  n.h3 = createTextElement('h3', config.Texts.Info.NativeNotifications.Title);

  n.header.appendChild(n.h3);
  n.secondCol.appendChild(n.header);

  n.notificationText = createElement('div', 'twofas-be-notification-text');
  n.p = createTextElement('p', config.Texts.Info.NativeNotifications.Message);
  n.a = createTextElement('a', config.Texts.Info.EnabledNativeNotifications);
  n.a.href = '#';
  n.a.addEventListener('click', openOptionsPage);

  n.p.appendChild(n.a);
  n.dot = document.createTextNode('.');
  n.p.appendChild(n.dot);

  n.notificationText.appendChild(n.p);
  n.secondCol.appendChild(n.notificationText);

  n.buttonsContainer = createElement('div', 'twofas-be-notification-buttons');
  n.buttonNever = createTextElement('button', browser.i18n.getMessage('neverShowAgain'), 'twofas-never');
  n.buttonClose = createTextElement('button', browser.i18n.getMessage('close'), 'twofas-close');

  n.buttonNever.addEventListener('click', () => neverShowNotificationInfo(n));
  n.buttonClose.addEventListener('click', () => closeNotificationInfo(n));

  n.buttonsContainer.appendChild(n.buttonNever);
  n.buttonsContainer.appendChild(n.buttonClose);
  n.secondCol.appendChild(n.buttonsContainer);

  n.notification.appendChild(n.secondCol);

  n.container.appendChild(n.notification);

  setTimeout(() => n.notification.classList.add('visible'), 300);

  window.addEventListener('beforeunload', () => {
    n.notification.classList.remove('visible');

    setTimeout(() => {
      n.notification.classList.add('hidden');
      n = null;
    }, 300);
  });
};

export default showNotificationInfo;
