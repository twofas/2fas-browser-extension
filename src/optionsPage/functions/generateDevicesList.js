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

import browser from 'webextension-polyfill';
import { createElement, createSVGElement, createTextElement } from '@partials/DOMElements';
import removeDevice from '@optionsPage/functions/removeDevice.js';
import generateEmptyDeviceRow from '@optionsPage/functions/generateEmptyDeviceRow.js';
import S from '@/selectors.js';
import months from '@partials/months.js';
import disconnectSVG from '@images/page-icons/disconnect.svg';

const generateDevicesList = list => {
  const tbody = document.querySelector(S.optionsPage.devicesList);

  if (list.length === 0) {
    generateEmptyDeviceRow(tbody);
  }

  const sortedList = list.sort((a, b) => Number(new Date(b.paired_at)) - Number(new Date(a.paired_at)));

  sortedList.forEach(device => {
    let t = {
      tr: null,
      td: [null, null, null, null],
      deviceName: null,
      pairDate: null,
      dateString: null,
      datePaired: null,
      platform: null,
      button: null,
      svg: null
    };

    t.tr = createElement('tr');
    t.tr.dataset.deviceId = device.id;

    t.td[0] = createElement('td');
    t.td[0].setAttribute('data-before-i18n', browser.i18n.getMessage('deviceName'));
    t.deviceName = createTextElement('span', device.name);

    t.td[0].appendChild(t.deviceName);
    t.tr.appendChild(t.td[0]);

    t.td[1] = createElement('td');
    t.td[1].setAttribute('data-before-i18n', browser.i18n.getMessage('pairingDate'));
    t.pairDate = new Date(device.paired_at);
    t.dateString = `${months[t.pairDate.getMonth()]} ${('0' + t.pairDate.getDate()).slice(-2)},  ${t.pairDate.getFullYear()}`;
    t.datePaired = createTextElement('span', t.dateString);

    t.td[1].appendChild(t.datePaired);
    t.tr.appendChild(t.td[1]);

    t.td[2] = createElement('td');
    t.td[2].setAttribute('data-before-i18n', browser.i18n.getMessage('platform'));
    t.platform = createTextElement('span', device.platform === 'android' ? 'Android' : 'iOS');

    t.td[2].appendChild(t.platform);
    t.tr.appendChild(t.td[2]);

    t.td[3] = createElement('td');
    t.td[3].setAttribute('data-before-i18n', browser.i18n.getMessage('disconnect'));
    t.button = createElement('button');
    t.button.dataset.deviceId = device.id;
    t.button.dataset.deviceName = device.name;
    t.button.addEventListener('click', removeDevice);

    t.svg = createSVGElement(disconnectSVG);
    t.button.appendChild(t.svg);

    t.td[3].appendChild(t.button);
    t.tr.appendChild(t.td[3]);

    tbody.appendChild(t.tr);
    t = null;
  });
};

export default generateDevicesList;
