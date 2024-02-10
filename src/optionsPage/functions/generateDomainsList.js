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
const { createElement, createSVGElement, createTextElement } = require('../../partials/DOMElements');
const generateEmptyDomainRow = require('./generateEmptyDomainRow');
const S = require('../../selectors');
const trashSVG = require('../../images/page-icons/trash.svg');
const removeDomain = require('./removeDomain');

const generateDomainsList = list => {
  if (!list) {
    list = [];
  }

  const newTbody = document.createElement('tbody');
  newTbody.classList.add('js-twofas-auto-submit-excluded-domain-list');

  const oldTbody = document.querySelector(S.optionsPage.autoSubmit.list);
  oldTbody.parentNode.replaceChild(newTbody, oldTbody);

  const tbody = newTbody;

  if (list.length === 0) {
    generateEmptyDomainRow(tbody);
  }

  list.map(domain => {
    let t = {
      tr: null,
      td: [null, null],
      domain: null,
      button: null,
      svg: null
    };

    t.tr = createElement('tr');
    t.tr.dataset.domain = domain;

    t.td[0] = createElement('td');
    t.td[0].setAttribute('data-before-i18n', browser.i18n.getMessage('domain'));
    t.domain = createTextElement('span', domain);

    t.td[0].appendChild(t.domain);
    t.tr.appendChild(t.td[0]);

    t.td[1] = createElement('td');
    t.td[1].setAttribute('data-before-i18n', browser.i18n.getMessage('optionsRemoveFromExcluded'));
    t.button = createElement('button');
    t.button.dataset.domain = domain;
    t.button.addEventListener('click', removeDomain);

    t.svg = createSVGElement(trashSVG);
    t.button.appendChild(t.svg);

    t.td[1].appendChild(t.button);
    t.tr.appendChild(t.td[1]);

    tbody.appendChild(t.tr);
    t = null;

    return domain;
  });
};

module.exports = generateDomainsList;
