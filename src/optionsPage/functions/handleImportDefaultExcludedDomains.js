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

const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');
const defaultAutoSubmitExcludedDomains = require('../../defaultAutoSubmitExcludedDomains');
const uniqueOnly = require('../../partials/uniqueOnly');
const generateDomainsList = require('./generateDomainsList');
const TwoFasNotification = require('../../notification');
const config = require('../../config');
const storeLog = require('../../partials/storeLog');

const handleImportDefaultExcludedDomains = e => {
  e.preventDefault();
  e.stopPropagation();

  return loadFromLocalStorage(['autoSubmitExcludedDomains'])
    .then(data => {
      const currentExcludedDomains = data.autoSubmitExcludedDomains;
      let newExcludedDomains = [...currentExcludedDomains, ...defaultAutoSubmitExcludedDomains];
      newExcludedDomains = newExcludedDomains.filter(uniqueOnly);

      return saveToLocalStorage({ autoSubmitExcludedDomains: newExcludedDomains }, {});
    })
    .then(res => {
      generateDomainsList(res.autoSubmitExcludedDomains);
      TwoFasNotification.show(config.Texts.Success.DomainExcluded);
    })
    .catch(async err => {
      await storeLog('error', 47, err, 'handleImportDefaultExcludedDomains');
      return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
    });
};

module.exports = handleImportDefaultExcludedDomains;
