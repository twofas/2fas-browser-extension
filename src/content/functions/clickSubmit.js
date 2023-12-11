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

const getFormSubmitElements = require('./getFormSubmitElements');

const closest = (counts, goal) => {
  return counts.indexOf(
    counts.reduce((prev, curr) => {
      return (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev);
    })
  );
};

const clickSubmit = (inputElement, siteURL) => {
  // @TODO: check URL

  const inputNumber = parseInt(inputElement?.dataset?.twofasElementNumber || -999);
  const submits = getFormSubmitElements();

  if (submits.length === 0) {
    return false;
  } else if (submits.length === 1) {
    try {
      submits[0].click();
    } catch (e) {}
  } else {
    const submitsNumbers = [];

    submits.forEach(submit => {
      submitsNumbers.push(parseInt(submit?.dataset?.twofasElementNumber || -999));
    });

    const submitElement = submits[closest(submitsNumbers, inputNumber)];
    
    if (submitElement) {
      try {
        submitElement.click();
      } catch (e) {}
    }
  }
};

module.exports = clickSubmit;