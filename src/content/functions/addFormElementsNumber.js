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

const addFormElementsNumber = elements => {
  let i = 0;

  if (!Array.isArray(elements) || elements?.length <= 0) {
    return false;
  }

  elements.forEach(element => {
    if (element?.getAttribute('data-twofas-element-number')) {
      return;
    }

    element.setAttribute('data-twofas-element-number', i.toString());
    i++;
  });
};

export default addFormElementsNumber;
