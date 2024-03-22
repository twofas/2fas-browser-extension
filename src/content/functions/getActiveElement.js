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

const { v4: uuidv4 } = require('uuid');
const clearFormElementsNumber = require('./clearFormElementsNumber');
const addFormElementsNumber = require('./addFormElementsNumber');
const getFormElements = require('./getFormElements');

const getActiveElement = () => {
  const activeElement = document.activeElement;
  let nodeName;

  if (activeElement) {
    nodeName = activeElement.nodeName.toLowerCase();
  }

  if (!activeElement || (nodeName !== 'input' && nodeName !== 'textarea')) {
    return {
      status: 'activeElement',
      nodeName,
      id: null
    };
  }

  const inputUUID = uuidv4();
  activeElement.setAttribute('data-twofas-input', inputUUID);

  clearFormElementsNumber();
  addFormElementsNumber(getFormElements());

  return {
    status: 'activeElement',
    nodeName,
    id: inputUUID
  };
};

module.exports = getActiveElement;
