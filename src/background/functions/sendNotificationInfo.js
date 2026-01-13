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

import config from '@/config.js';
import storeLog from '@partials/storeLog.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import TwoFasNotification from '@notification/index.js';
import sendMessageToTab from '@partials/sendMessageToTab.js';

const sendNotificationInfo = tab => {
  return loadFromLocalStorage(['nativePush'])
    .then(storage => {
      if (!storage.nativePush) {
        return Promise.resolve();
      }

      return sendMessageToTab(tab?.id, { action: 'notificationInfo' });
    })
    .catch(async err => {
      await storeLog('error', 10, err, tab?.url);
      return TwoFasNotification.show(config.Texts.Error.UndefinedError, tab?.id);
    });
};

export default sendNotificationInfo;
