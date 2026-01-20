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

import generateEmptyDomainRow from '@optionsPage/functions/generateEmptyDomainRow.js';
import S from '@/selectors.js';

/**
 * Removes a domain row from the DOM and shows empty state if no domains remain.
 *
 * @param {string} domain - The domain name to remove from the list
 * @returns {boolean} Always returns true after removal
 */
const removeDomainFromDOM = domain => {
  const tr = document.querySelector(`tr[data-domain="${domain}"]`);

  if (tr && typeof tr.remove === 'function') {
    tr.remove();
  }

  const tbody = document.querySelector(S.optionsPage.autoSubmit.list);

  if (tbody.childElementCount === 0) {
    generateEmptyDomainRow(tbody);
  }

  return true;
};

export default removeDomainFromDOM;
