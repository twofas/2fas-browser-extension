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

const S = require('../../selectors');
const handleAdvancedHeaderClick = require('./handleAdvancedHeaderClick');
const handleLoggingChange = require('./handleLoggingChange');
const handleContextMenuChange = require('./handleContextMenuChange');
const handlePushChange = require('./handlePushChange');
const handleSafariReset = require('./handleSafariReset');
const sendTestNotification = require('./sendTestNotification');

const setAdvanced = () => {
  const advancedHeader = document.querySelector(S.optionsPage.advanced.header);
  advancedHeader.addEventListener('click', handleAdvancedHeaderClick);

  const loggingToggle = document.querySelector(S.optionsPage.logsInput);
  const contextMenuToggle = document.querySelector(S.optionsPage.contextMenuInput);
  const pushRadios = document.querySelectorAll('input[name="pushConfig"]');
  const testNotificationBtn = document.querySelector(S.optionsPage.testNotification);
  const safariResetBtn = document.querySelector(S.optionsPage.safariReset);

  if (loggingToggle) {
    loggingToggle.addEventListener('change', handleLoggingChange);
  }

  if (contextMenuToggle) {
    contextMenuToggle.addEventListener('change', handleContextMenuChange);
  }

  if (pushRadios) {
    Array.from(pushRadios).forEach(radio => radio.addEventListener('change', handlePushChange));
  }

  if (testNotificationBtn) {
    testNotificationBtn.addEventListener('click', sendTestNotification);
  }

  if (safariResetBtn) {
    safariResetBtn.addEventListener('click', handleSafariReset);
  }
};

module.exports = setAdvanced;
