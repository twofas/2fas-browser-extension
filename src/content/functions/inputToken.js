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

/* global Event, KeyboardEvent */
const delay = require('../../partials/delay');
const getTabData = require('./getTabData');
const clickSubmit = require('./clickSubmit');
const clearAfterInputToken = require('./clearAfterInputToken');

const inputToken = (request, inputElement, siteURL) => {
  return new Promise(resolve => {
    if (!request.token) {
      return { status: 'error' };
    }

    if (!inputElement) {
      return { status: 'emptyInput' };
    }

    const tokenLength = request.token.length;
    let clearEvent = new Event('change', { bubbles: true, cancelable: true });
    let inputEvent = new Event('input', { bubbles: true, cancelable: true });
    const promises = [];

    for (let i = 0; i < tokenLength; i++) {
      promises.push(
        delay(() => {
          // MANY INPUTS FIX
          if (i === 0) {
            inputElement.focus();
            inputElement.value = '';
            inputElement.dispatchEvent(clearEvent);
            inputElement.focus();
          }

          if (!inputElement.contains(document.activeElement)) {
            if (!siteURL.includes('secure.newegg')) { // NEWEGG FIX
              document.activeElement.focus();
              document.activeElement.value = '';
              document.activeElement.dispatchEvent(clearEvent);
              document.activeElement.focus();
            }
          }
          // END MANY INPUTS FIX

          document.activeElement.value += request.token[i];
          document.activeElement.dispatchEvent(inputEvent);

          // FORTRA GOANYWHERE FIX
          if (siteURL.includes('.goanywhere.cloud') {
            document.getElementById('formPanel:answer_hinput').value = request.token;
          }
          // FORTRA GOANYWHERE FIX
          
          // NORTON FIX
          if (siteURL.includes('login.norton') || siteURL.includes('indodax.com')) {
            document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: request.token[i] }));
          }
          // END NORTON FIX
        }, 100 * i)
      );
    }

    return Promise.all(promises)
      .then(async () => {
        clearEvent = null;
        inputEvent = null;

        const tab = await getTabData();

        if (tab.status === 'complete') {
          clickSubmit(inputElement, siteURL);
        }

        clearAfterInputToken(inputElement, tab.id);

        return resolve({
          status: 'completed',
          url: siteURL
        });
      });
  });
};

module.exports = inputToken;
