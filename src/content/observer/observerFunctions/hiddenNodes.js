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
const isVisible = require('../../functions/isVisible');
const findSignificantChanges = require('./findSignificantChanges');
const getChildNodes = require('./getChildNodes');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../../localStorage');
const storeLog = require('../../../partials/storeLog');
const { clearFormElementsNumber, addFormElementsNumber, getFormElements } = require('../../functions');
const uniqueOnly = require('../../../partials/uniqueOnly');

let queue = [];
let tabData = null;
let timeout;

const process = async nodes => {
  if (document.readyState !== 'complete') {
    timeout = window.requestAnimationFrame(() => process(nodes));
  }

  if (!nodes || nodes.length <= 0 || !tabData) {
    return false;
  }

  const hiddenNodes =
    nodes
      .filter(uniqueOnly)
      .filter(node => findSignificantChanges(node) && node.getAttribute('data-twofas-input'))
      .flatMap(getChildNodes)
      .filter(uniqueOnly)
      .filter(node => findSignificantChanges(node) && node.getAttribute('data-twofas-input'));

  let storage;

  clearFormElementsNumber();
  addFormElementsNumber(getFormElements());

  try {
    storage = await loadFromLocalStorage([`tabData-${tabData?.id}`]);
  } catch (err) {
    return storeLog('error', 41, err, tabData?.url);
  }
  
  if (!storage[`tabData-${tabData?.id}`] || !storage[`tabData-${tabData?.id}`].lastFocusedInput) {
    return false;
  }

  return hiddenNodes.forEach(async node => {
    const visible = await isVisible(node);
  
    if (node.getAttribute('data-twofas-input') === storage[`tabData-${tabData?.id}`].lastFocusedInput && !visible) {
      delete storage[`tabData-${tabData?.id}`].lastFocusedInput;
  
      if (document?.activeElement && document?.activeElement?.getAttribute('data-twofas-input')) {
        storage[`tabData-${tabData?.id}`].lastFocusedInput = document.activeElement.getAttribute('data-twofas-input');
      }
  
      return saveToLocalStorage({ [`tabData-${tabData?.id}`]: storage[`tabData-${tabData?.id}`] })
        .catch(err => storeLog('error', 42, err, tabData?.url));
    }

    queue = [];
  });
};

const hiddenNodes = (mutation, tabInfo) => {
  if (!mutation?.target || !browser?.runtime?.id) {
    return false;
  }

  queue.push(mutation.target);

  if (!tabData) {
    tabData = tabInfo;
  }

  if (timeout) {
    window.cancelAnimationFrame(timeout);
  }

  timeout = window.requestAnimationFrame(() => process(queue));
};

module.exports = hiddenNodes;
