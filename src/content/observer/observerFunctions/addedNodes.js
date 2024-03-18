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
const findSignificantChanges = require('./findSignificantChanges');
const { getInputs, addInputListener, clearFormElementsNumber, addFormElementsNumber, getFormElements } = require('../../functions');
const getChildNodes = require('./getChildNodes');
const storeLog = require('../../../partials/storeLog');
const notObservedNodes = require('../observerConstants/notObservedNodes');
const uniqueOnly = require('../../../partials/uniqueOnly');

let queue = [];
let tabData = null;
let timeout;

const process = nodes => {
  if (document.readyState !== 'complete') {
    timeout = window.requestAnimationFrame(() => process(nodes));
  }

  if (!nodes || nodes.length <= 0 || !tabData) {
    return false;
  }

  const addedNodes =
    nodes
      .filter(uniqueOnly)
      .filter(node => !notObservedNodes.includes(node.nodeName.toLowerCase()))
      .flatMap(getChildNodes)
      .filter(uniqueOnly)
      .filter(node => !notObservedNodes.includes(node.nodeName.toLowerCase()));

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
    return false;
  }

  queue.push(mutation.target);
  queue.push(...Array.from(mutation.addedNodes));

  if (!tabData) {
    tabData = tabInfo;
  }

  if (timeout) {
    window.cancelAnimationFrame(timeout);
  }

  timeout = window.requestAnimationFrame(() => process(queue));
};

module.exports = addedNodes;
