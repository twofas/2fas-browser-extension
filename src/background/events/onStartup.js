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

import { initContextMenu } from '@background/contextMenu/index.js';
import storeLog from '@partials/storeLog.js';

/**
 * Handles browser startup event.
 * Recreates context menus which don't persist between sessions in Firefox.
 * Note: tabData cleanup is no longer needed since we use session storage.
 * @async
 * @return {Promise<void>}
 */
const onStartup = async () => {
  try {
    await initContextMenu();
  } catch (err) {
    await storeLog('error', 1, err, 'onStartup');
  }
};

export default onStartup;
