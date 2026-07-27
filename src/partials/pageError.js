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

import storeLog from '@partials/storeLog.js';
import TwoFasNotification from '@notification/index.js';

/**
 * Builds a page-bootstrap catch handler that logs the failure and then surfaces a
 * persistent error notification. The install and options page entrypoints differ
 * only in log id, source label and notification text, so both compose this factory.
 * @param {number} logID - The storeLog error id for this page.
 * @param {string} source - The storeLog source label.
 * @param {Object} notificationObject - The notification to show (a config.Texts.Error.* entry).
 * @returns {function(Error): Promise<*>} An async handler that logs the error then notifies.
 */
const pageError = (logID, source, notificationObject) => async err => {
  await storeLog('error', logID, err, source);
  return TwoFasNotification.showWithoutTimeout(notificationObject);
};

export default pageError;
