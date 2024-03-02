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
const significantInputs = require('../observerConstants/significantInputs');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../../localStorage');
const getChildNodes = require('./getChildNodes');
const storeLog = require('../../../partials/storeLog');
const { clearFormElementsNumber, addFormElementsNumber, getFormElements } = require('../../functions');
const notObservedNodes = require('../observerConstants/notObservedNodes');
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

  const ids = [];
  let storage;

  const removedNodes =
    nodes
      .filter(uniqueOnly)
      .filter(node => !notObservedNodes.includes(node.nodeName.toLowerCase()))
      .flatMap(getChildNodes)
      .filter(uniqueOnly)
      .filter(node => !notObservedNodes.includes(node.nodeName.toLowerCase()));

  removedNodes.forEach(node => {
    const nodeName = node.nodeName.toLowerCase();

    if (!significantInputs.includes(nodeName)) {
      return false;
    }
  
    const twofasInput = node.getAttribute('data-twofas-input');
  
    if (twofasInput) {
      ids.push(twofasInput);
    }
  });

  queue = [];

  if (ids.length <= 0) {
    return false;
  }

  clearFormElementsNumber();
  addFormElementsNumber(getFormElements());

  try {
    storage = await loadFromLocalStorage([`tabData-${tabData?.id}`]);
  } catch (err) {
    return storeLog('error', 39, err, tabData?.url);
  }
  
  if (!storage[`tabData-${tabData?.id}`] || !storage[`tabData-${tabData?.id}`].lastFocusedInput) {
    return false;
  }

  if (ids.includes(storage[`tabData-${tabData?.id}`].lastFocusedInput)) {
    delete storage[`tabData-${tabData?.id}`].lastFocusedInput;
  }
  
  return saveToLocalStorage({ [`tabData-${tabData?.id}`]: storage[`tabData-${tabData?.id}`] })
    .catch(err => storeLog('error', 40, err, tabData?.url));
};

const removedNodes = (mutation, tabInfo) => {
  if (!mutation?.target || !browser?.runtime?.id) {
    return false;
  }

  queue.push(...Array.from(mutation.target));
  queue.push(...Array.from(mutation.removedNodes));

  if (!tabData) {
    tabData = tabInfo;
  }

  if (timeout) {
    window.cancelAnimationFrame(timeout);
  }

  timeout = window.requestAnimationFrame(() => process(queue));
};

module.exports = removedNodes;
