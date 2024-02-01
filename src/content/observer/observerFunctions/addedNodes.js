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

/* global requestAnimationFrame */
const browser = require('webextension-polyfill');
const findSignificantChanges = require('./findSignificantChanges');
const { getInputs, addInputListener, clearFormElementsNumber, addFormElementsNumber, getFormElements } = require('../../functions');
const storeLog = require('../../../partials/storeLog');
const notObservedNodes = require('../observerConstants/notObservedNodes');

let queue = [];
let tabData = null;
let processInterval = null;

processInterval = setInterval(() => {
  requestAnimationFrame(() => process(queue));
}, 200);

window.addEventListener('beforeunload', () => {
  clearInterval(processInterval);
}, { once: true });

const process = nodes => {
  if (nodes.length <= 0 || !tabData) {
    return false;
  }

  const addedNodes = nodes.filter((value, index, array) => array.indexOf(value) === index);

  let newInputs = false;
  let inputs = [];

  for (const node in addedNodes) {
    if (findSignificantChanges(addedNodes[node])) {
      newInputs = true;
    }
  }

  if (!newInputs) {
    for (const node in addedNodes) {
      inputs.push(...getInputs(addedNodes[node]));
    }

    inputs = inputs.filter(node => !node.hasAttribute('data-twofas-input'));
    newInputs = inputs.length > 0;
  } else {
    inputs = getInputs();
  }

  if (newInputs) {
    try {
      addInputListener(inputs, tabData?.id);
      clearFormElementsNumber();
      addFormElementsNumber(getFormElements());
    } catch (err) {
      return storeLog('error', 15, err, tabData?.url);
    }
  }

  queue = [];
};

const addedNodes = (mutation, tabInfo) => {
  if (!mutation?.target || !browser?.runtime?.id) {
    return false
  }

  const newNodes =
    Array.from(mutation?.addedNodes)
      .concat(mutation?.target)
      .filter(node => !notObservedNodes.includes(node.nodeName.toLowerCase()));

  if (!newNodes || newNodes.length <= 0) {
    return false;
  }

  queue.push(...newNodes);

  if (!tabData) {
    tabData = tabInfo;
  }
};

module.exports = addedNodes;
