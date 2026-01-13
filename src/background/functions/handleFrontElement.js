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

import config from '@/config.js';
import TwoFasNotification from '@notification/index.js';
import saveToLocalStorage from '@localStorage/saveToLocalStorage.js';

const handleFrontElement = async (activeElements, tabId, storage) => {
  let properElements = [];

  if (activeElements && activeElements.length > 0) {
    properElements = activeElements.filter(el =>
      el?.id &&
      (typeof el?.id === 'string' || el?.id instanceof String) &&
      el?.id?.length > 0 &&
      (el?.nodeName === 'input' || el?.nodeName === 'textarea')
    );
  }

  if (properElements.length > 0) {
    const tabData = storage[`tabData-${tabId}`] || {};
    tabData.lastFocusedInput = properElements[0].id;
    await saveToLocalStorage({ [`tabData-${tabId}`]: tabData }, storage);
    return TwoFasNotification.show(config.Texts.Success.PushSent, tabId);
  }

  return TwoFasNotification.show(config.Texts.Success.PushSentClipboard, tabId);
};

export default handleFrontElement;
