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

const updateEventListener = (input, func) => {
  const removeListener = () => {
    if (typeof input.removeEventListener === 'function') {
      input.removeEventListener('focus', func);
    }
  };

  removeListener();

  if (typeof input.addEventListener === 'function') {
    input.addEventListener('focus', func);
  }

  if (input && input?.dataset) {
    input.dataset.twofasInputListener = 'true';
  }

  if (input === document.activeElement || input.matches(':focus')) {
    func({ target: input });
  }

  window.addEventListener('onbeforeunload', removeListener, { once: true });
};

module.exports = updateEventListener;
