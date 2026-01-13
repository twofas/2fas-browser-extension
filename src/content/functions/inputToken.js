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

/* global Event, KeyboardEvent, InputEvent */
import runTasksWithDelay from '@partials/runTasksWithDelay.js';
import getTabData from '@content/functions/getTabData.js';
import clickSubmit from '@content/functions/clickSubmit.js';
import clearAfterInputToken from '@content/functions/clearAfterInputToken.js';

const inputToken = (request, inputElement, siteURL) => {
  return new Promise(resolve => {
    if (!request.token) {
      return { status: 'error' };
    }

    if (!inputElement) {
      return { status: 'emptyInput' };
    }

    const tokenLength = request.token.length;
    const promises = [];

    inputElement.value = '';
    inputElement.focus();

    for (let i = 0; i < tokenLength; i++) {
      promises.push(
        () => new Promise(resolve => {
          const digit = request.token[i];
          const digitNum = Number(digit);
          const keyCode = 48 + digitNum;

          if (document.activeElement !== inputElement) {
            document.activeElement.value = '';
          }

          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, charCode: 0, code: `Digit${digit}`, ctrlKey: false, key: digit, keyCode, location: 0, metaKey: false, repeat: false, shiftKey: false, which: keyCode }));
          document.activeElement.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, charCode: keyCode, code: `Digit${digit}`, ctrlKey: false, key: digit, keyCode, location: 0, metaKey: false, repeat: false, shiftKey: false, which: keyCode }));

          if (document.activeElement.type.toLowerCase() === 'number') {
            document.activeElement.value += digitNum;
          } else {
            document.activeElement.value += digit;
          }

          document.activeElement.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: digit, inputType: 'insertText', which: 0 }));
          document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, charCode: 0, code: `Digit${digit}`, ctrlKey: false, key: digit, keyCode, location: 0, metaKey: false, repeat: false, shiftKey: false, which: keyCode }));
          document.activeElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

          return resolve();
        })
      );
    }

    return runTasksWithDelay(promises, 150)
      .then(async () => {
        let tab = {};

        try {
          tab = await getTabData();
        } catch {
          return resolve({ status: 'completed', url: siteURL });
        }

        if (tab?.status === 'complete') {
          clickSubmit(inputElement, siteURL);
        }

        clearAfterInputToken(inputElement, tab?.id);

        return resolve({
          status: 'completed',
          url: siteURL
        });
      });
  });
};

export default inputToken;
