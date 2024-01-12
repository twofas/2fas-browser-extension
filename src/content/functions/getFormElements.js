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

const buttonsTexts = require('../../partials/buttonsTexts');
const ignoreButtonTexts = require('../../partials/ignoreButtonTexts');

const getFormElements = () => {
  const inputsSelector = require('../../partials/inputsSelectors')();
  let submits = require('../../partials/formSubmitSelectors')();
  let submitTextCheck = false;

  let submitsLength = document.querySelectorAll(submits).length;
  if (submitsLength <= 0) {
    submits = require('../../partials/formSubmitSecondSelectors')();
  }

  submitsLength = document.querySelectorAll(submits).length;
  if (submitsLength <= 0) {
    submits = 'button';
    submitTextCheck = true;
  }

  const query = inputsSelector.concat(',', submits);
  let elements = Array.from(document.querySelectorAll(query));

  if (submitTextCheck) {
    elements = elements.filter(element => {
      if (element.nodeName.toLowerCase() === 'input') {
        return true;
      }

      if (element.nodeName.toLowerCase() === 'button') {
        return buttonsTexts.includes(element.innerText.toLowerCase())
      }

      return false;
    })
  }

  return elements.filter(element => !ignoreButtonTexts().includes(element.innerText.toLowerCase()));
};

module.exports = getFormElements;
