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

import openInstallPage from '@background/functions/openInstallPage.js';
import storeLog from '@partials/storeLog.js';
import updateBrowserInfo from '@background/functions/updateBrowserInfo.js';
import { initContextMenu } from '@background/contextMenu/index.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import checkSafariStorage from '@background/functions/checkSafariStorage.js';
import getBrowserInfo from '@background/functions/getBrowserInfo.js';
import runStorageMigrations from '@background/functions/storageMigrations.js';

/**
 * Handles extension installation and update events.
 *
 * For 'update' / 'browser_update' reasons we read browser info from storage (preserves the
 * persisted name + random suffix). For first install we force a fresh name — storage is empty.
 *
 * @async
 * @param {Object} details - Installation details from the browser.
 * @return {Promise<void>}
 */
const onInstalled = async details => {
  if (process.env.EXT_PLATFORM !== 'Firefox') {
    await initContextMenu();
  }

  if (details?.reason !== 'install') {
    // Bring existing installs up to the current storage schema before touching
    // browser info / registration. Offline-only and a no-op once up to date.
    await runStorageMigrations();

    const browserInfo = await getBrowserInfo();
    return updateBrowserInfo(browserInfo);
  }

  const browserInfo = await getBrowserInfo({ force: true });

  if (process.env.EXT_PLATFORM === 'Safari') {
    return checkSafariStorage(browserInfo);
  }

  try {
    await generateDefaultStorage(browserInfo);
    await openInstallPage();
  } catch (err) {
    await storeLog('error', 9, err, 'onInstalled');
  }
};

export default onInstalled;
