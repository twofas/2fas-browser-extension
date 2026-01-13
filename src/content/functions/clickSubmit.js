//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2026 Two Factor Authentication Service, Inc.
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

import getFormSubmitElements from '@content/functions/getFormSubmitElements.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import storeLog from '@partials/storeLog.js';
import delay from '@partials/delay.js';
import ignoreButtonTexts from '@partials/ignoreButtonTexts.js';

const closest = (counts, goal) => {
  return counts.indexOf(
    counts.reduce((a, b) => {
      const aDiff = Math.abs(a - goal);
      const bDiff = Math.abs(b - goal);
  
      if (aDiff === bDiff) {
        // Choose largest vs smallest (> vs <)
        return a > b ? a : b;
      } else {
        return bDiff < aDiff ? b : a;
      }
    })
  );
};

const clickSubmit = (inputElement, siteURL) => {
  return delay(() => {}, 500)
    .then(() => loadFromLocalStorage(['autoSubmitExcludedDomains', 'autoSubmitEnabled']))
    .then(storage => {
      if (!storage?.autoSubmitEnabled) {
        return false;
      }

      const domains = storage.autoSubmitExcludedDomains || [];
      let url, hostname;
      
      try {
        url = new URL(siteURL);
        hostname = url.hostname.replace(/^(www\.)?/, '').replace(/\/$/, '');

        if (domains && domains?.includes(hostname)) {
          return false;
        }
      } catch (err) {}

      const inputNumber = parseInt(inputElement?.dataset?.twofasElementNumber || -999);
      const submits = getFormSubmitElements();
      const form = inputElement.closest('form');

      if (submits.length === 0) {
        return false;
      }
      
      if (form) {
        const formSubmit = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
  
        if (formSubmit && formSubmit.length === 1) {
          const formSubmitText = formSubmit[0]?.innerText;

          if (
            formSubmitText &&
            typeof formSubmitText.trim === 'function' &&
            typeof formSubmitText.toLowerCase === 'function' &&
            !ignoreButtonTexts().includes(formSubmitText.trim().toLowerCase())
          ) {
            try {
              formSubmit[0].click();
            } catch (e) {}
          } else {
            try {
              formSubmit[0].click();
            } catch (e) {}
          }

          return true;
        }
      }
      
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
    })
    .catch(async err => {
      await storeLog('error', 46, err, 'clickSubmit');
    });
};

export default clickSubmit;
