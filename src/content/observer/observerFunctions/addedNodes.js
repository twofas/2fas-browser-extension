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
const checkChildNodes = require('./checkChildNodes');
const { getTabData, getInputs, addInputListener, clearFormElementsNumber, addFormElementsNumber, getFormElements } = require('../../functions');
const storeLog = require('../../../partials/storeLog');

const addedNodes = mutation => {
  let newInputs = false;
  const nodesArr = Array.from(mutation.addedNodes).concat(mutation.target);

  nodesArr.map(node => {
    if (findSignificantChanges(node)) {
      newInputs = true;
      return node;
    }

    let newInputsArr = checkChildNodes(node.childNodes);

    if (newInputsArr && Array.isArray(newInputsArr) && newInputsArr?.length > 0) {
      newInputsArr = newInputsArr.flat().filter(x => x);
    }

    if (newInputsArr && newInputsArr?.length > 0) {
      newInputs = true;
    }

    return node;
  });

  if (newInputs) {
    let tabData;

    if (!browser?.runtime?.id) {
      return false;
    }

    return getTabData()
      .then(res => {
        tabData = res;
        return getInputs();
      })
      .then(inputs => addInputListener(inputs, tabData?.id))
      .then(clearFormElementsNumber)
      .then(() => addFormElementsNumber(getFormElements()))
      .catch(err => storeLog('error', 15, err, tabData?.url));
  }
};

module.exports = addedNodes;
