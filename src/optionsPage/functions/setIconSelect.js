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

const SlimSelect = require('slim-select');
const browser = require('webextension-polyfill');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');
const checkTabCS = require('../../background/functions/checkTabCS');

const setIconSelect = async () => {
  const { extIcon } = await loadFromLocalStorage(['extIcon']);

  // eslint-disable-next-line no-new
  new SlimSelect({
    select: '#twofas-icon-select',
    data: [
      {
        html: `<span><img src="${browser.runtime.getURL('images/icons/icon128.png')}" alt="Default" /><span>Default</span></span>`,
        text: 'Default',
        value: 0,
        selected: extIcon === 0
      },
      {
        html: `<span><img src="${browser.runtime.getURL('images/icons/icon128_1.png')}" alt="Type1" /><span>Type 1</span></span>`,
        text: 'Type 1',
        value: 1,
        selected: extIcon === 1
      },
      {
        html: `<span><img src="${browser.runtime.getURL('images/icons/icon128_2.png')}" alt="Type1" /><span>Type 2</span></span>`,
        text: 'Type 2',
        value: 2,
        selected: extIcon === 2
      }
    ],
    settings: {
      showSearch: false,
      closeOnSelect: true
    },
    events: {
      afterChange: async item => {
        const tabID = await browser.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0].id);

        await saveToLocalStorage({ extIcon: parseInt(item[0].value, 10) });
        await checkTabCS(tabID);
      }
    }
  });
};

module.exports = setIconSelect;
