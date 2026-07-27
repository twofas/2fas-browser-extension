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

import openBrowserPage from '@background/functions/openBrowserPage.js';

/**
 * Handles '2FAS' port connections from content scripts and extension pages.
 *
 * The port no longer doubles as a service-worker keep-alive (that concern moved to
 * the request-scoped browser.alarms keep-alive); it now only carries openBrowserPage
 * requests from contexts that cannot open a tab themselves.
 *
 * @param {Object} port - The port object for communication.
 * @return {boolean|undefined}
 */
const onConnect = port => {
  if (port.name !== '2FAS') {
    return false;
  }

  const onPortMessage = msg => {
    if (msg?.action === 'openBrowserPage' && msg.url) {
      openBrowserPage(msg.url);
    }
  };

  const onPortDisconnect = () => {
    port.onMessage.removeListener(onPortMessage);
    port.onDisconnect.removeListener(onPortDisconnect);
  };

  port.onMessage.addListener(onPortMessage);
  port.onDisconnect.addListener(onPortDisconnect);
};

export default onConnect;
