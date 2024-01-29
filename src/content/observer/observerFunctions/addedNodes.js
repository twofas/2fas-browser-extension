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
const { getInputs, addInputListener, clearFormElementsNumber, addFormElementsNumber, getFormElements } = require('../../functions');
const storeLog = require('../../../partials/storeLog');

const addedNodes = (mutation, tabData) => {
  if (!mutation?.target || !browser?.runtime?.id) {
    return false
  }

  let newInputs = false;

  if (findSignificantChanges(mutation.target)) {
    newInputs = true;
  }

  if (!newInputs) {
    newInputs = checkChildNodes(mutation.target);
  }

  if (newInputs) {
    try {
      const inputs = getInputs();
      addInputListener(inputs, tabData?.id);
      clearFormElementsNumber();
      addFormElementsNumber(getFormElements());
    } catch (err) {
      return storeLog('error', 15, err, tabData?.url);
    }
  }
};

module.exports = addedNodes;
