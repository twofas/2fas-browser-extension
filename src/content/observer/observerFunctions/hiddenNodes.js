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
const significantInputs = require('../observerConstants/significantInputs');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../../localStorage');
const storeLog = require('../../../partials/storeLog');

const hiddenNodes = async (mutation, tabData) => {
  let storage;

  const node = mutation.target;
  const nodeName = node.nodeName.toLowerCase();

  if (!significantInputs.includes(nodeName)) {
    return false;
  }

  const twofasInput = node.getAttribute('data-twofas-input');

  if (!twofasInput) {
    return false;
  }

  const visible = await isVisible(node);
  
  if (visible) {
    return false;
  }

  try {
    storage = await loadFromLocalStorage([`tabData-${tabData?.id}`]);
  } catch (err) {
    return storeLog('error', 41, err, tabData?.url);
  }

  if (!storage[`tabData-${tabData?.id}`] || !storage[`tabData-${tabData?.id}`].lastFocusedInput) {
    return false;
  }

  if (twofasInput === storage[`tabData-${tabData?.id}`].lastFocusedInput) {
    delete storage[`tabData-${tabData?.id}`].lastFocusedInput;
  }

  return saveToLocalStorage({ [`tabData-${tabData?.id}`]: storage[`tabData-${tabData?.id}`] })
    .catch(err => storeLog('error', 42, err, tabData?.url));
};

module.exports = hiddenNodes;
