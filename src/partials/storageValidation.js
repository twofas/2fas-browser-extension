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

import config from '../config.js';
import TwoFasNotification from '../notification/index.js';

const storageValidation = storage => {
  return new Promise((resolve, reject) => {
    if (
      !storage.keys ||
      !storage?.keys?.publicKey ||
      !storage?.keys?.privateKey ||
      !storage?.extensionID
    ) {
      if (storage?.attempt && storage?.attempt > 5) {
        TwoFasNotification.show(config.Texts.Error.StorageIntegrity);
        return reject(new TypeError('Too many attempts'));
      }

      TwoFasNotification.show(config.Texts.Error.StorageCorrupted);
      return reject(new TypeError('Storage corrupted'));
    }

    // @TODO: Future reset attempts?
    return resolve();
  });
};

export default storageValidation;
