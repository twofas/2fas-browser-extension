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

const isVisible = require('../../functions/isVisible');
const findSignificantChanges = require('./findSignificantChanges');
const getChildNodes = require('./getChildNodes');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../../localStorage');
const storeLog = require('../../../partials/storeLog');
const { clearFormElementsNumber, addFormElementsNumber, getFormElements } = require('../../functions');

const hiddenNodes = async (mutation, tabData) => {
  let storage;

  try {
    storage = await loadFromLocalStorage([`tabData-${tabData?.id}`]);
  } catch (err) {
    return storeLog('error', 41, err, tabData?.url);
  }

  if (!storage[`tabData-${tabData?.id}`] || !storage[`tabData-${tabData?.id}`].lastFocusedInput) {
    return false;
  }

  let hiddenInputs = [mutation.target, ...getChildNodes(mutation.target.childNodes).flat()];
  hiddenInputs = hiddenInputs.filter(node => findSignificantChanges(node) && node.getAttribute('data-twofas-input'));

  if (hiddenInputs.length > 0) {
    clearFormElementsNumber();
    addFormElementsNumber(getFormElements());
  }

  return hiddenInputs.map(async node => {
    const visible = await isVisible(node);

    if (node.getAttribute('data-twofas-input') === storage[`tabData-${tabData?.id}`].lastFocusedInput && !visible) {
      delete storage[`tabData-${tabData?.id}`].lastFocusedInput;

      if (document?.activeElement && document?.activeElement?.getAttribute('data-twofas-input')) {
        storage[`tabData-${tabData?.id}`].lastFocusedInput = document.activeElement.getAttribute('data-twofas-input');
      }

      return saveToLocalStorage({ [`tabData-${tabData?.id}`]: storage[`tabData-${tabData?.id}`] })
        .catch(err => storeLog('error', 42, err, tabData?.url));
    }

    return false;
  });
};

module.exports = hiddenNodes;
