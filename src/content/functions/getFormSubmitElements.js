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
const formSubmitSelectors = require('../../partials/formSubmitSelectors');
const formSubmitSecondSelectors = require('../../partials/formSubmitSecondSelectors');

const getFormSubmitElements = () => {
  let submits = Array.from(
    document.querySelectorAll(formSubmitSelectors())
  );

  if (submits.length <= 0) {
    submits = Array.from(
      document.querySelectorAll(formSubmitSecondSelectors())
    );
  }

  if (submits.length <= 0) {
    const buttons = Array.from(document.querySelectorAll('input[type="button"],button'));
    submits = buttons.filter(button => buttonsTexts.includes(button.innerText.trim().toLowerCase()));
  }

  return submits.filter(button => !ignoreButtonTexts().includes(button.innerText.trim().toLowerCase()));
};

module.exports = getFormSubmitElements;
