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

/* global MutationObserver, HTMLElement */
const addedNodes = require('./observerFunctions/addedNodes');
const hiddenNodes = require('./observerFunctions/hiddenNodes');
const removedNodes = require('./observerFunctions/removedNodes');
const notObservedNodes = require('./observerConstants/notObservedNodes');
const notObservedAttributes = require('./observerConstants/notObservedAttributes');

const createObserver = tabData => {
  return new MutationObserver(mutations => {
    if (!mutations) {
      return false;
    }

    mutations.forEach(async mutation => {
      const mutationNodeName = mutation.target.nodeName.toLowerCase();

      if (
        !mutation ||
        !(mutation?.target instanceof HTMLElement) ||
        mutation?.target?.classList?.contains('twofas-be-notification') ||
        notObservedAttributes.includes(mutation?.attributeName) ||
        notObservedNodes.includes(mutationNodeName)
      ) {
        return false;
      }

      if (
        (mutation?.addedNodes && Array.from(mutation?.addedNodes).length > 0) ||
        (mutation?.attributeName === 'disabled' && !mutation?.target?.disabled) ||
        (mutation?.attributeName === 'style' && mutation?.target)
      ) {
        addedNodes(mutation, tabData);
      }

      if (mutation?.type === 'attributes' && mutation?.target) {
        hiddenNodes(mutation, tabData);
      }

      if (mutation?.removedNodes && Array.from(mutation?.removedNodes).length > 0) {
        removedNodes(mutation, tabData);
      }
    });
  });
};

module.exports = createObserver;
