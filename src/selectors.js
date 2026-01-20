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

/**
 * CSS selectors for DOM elements used throughout the extension.
 * @type {Object}
 */
const selectors = {
  installPage: {
    configured: '.twofas-install-page-configured',
    newDevice: '.twofas-install-page-new-device',
    welcomeHeader: 'h1.twofas-js-welcome-header',
    container: {
      app: '.twofas-install-page-container-blocks-app',
      qr: '.twofas-install-page-container-blocks-qr',
      handler: '.js-twofas-install-handler'
    },
    qr: {
      timeout: '.twofas-qr-container-timeout',
      regenerate: '.js-twofas-regenerate-qr',
      imgs: 'img.twofas-js-qrcode',
      manual: '.twofas-js-qr-manual p'
    }
  },
  optionsPage: {
    confirmModal: {
      element: '.js-twofas-confirm-modal',
      cancel: '.js-twofas-confirm-modal-cancel',
      confirm: '.js-twofas-confirm-modal-confirm',
      header: '.js-twofas-confirm-modal-header',
      text: '.js-twofas-confirm-modal-text'
    },
    domainModal: {
      element: '.js-twofas-domain-modal',
      cancel: '.js-twofas-domain-modal-cancel',
      form: '.js-twofas-domain-modal-form',
      input: '.js-twofas-domain-modal-input',
      validation: '.js-twofas-domain-modal-validation'
    },
    shortcut: {
      edit: '.js-twofas-shortcut-edit',
      editText: '.js-twofas-shortcut-edit-text',
      editBox: '.js-twofas-shortcut-edit-box',
      editBoxBtn: '.twofas-shortcut-edit-box-btn',
      editBoxPlus: '.twofas-shortcut-edit-box-plus',
      info: '.js-twofas-shortcut-info',
      tooltip: '.js-twofas-shortcut-tooltip',
      close: '.js-twofas-shortcut-close',
      description: '.js-twofas-shortcut-description'
    },
    advanced: {
      header: '.js-twofas-advance-header',
      content: '.js-twofas-advance-content'
    },
    pin: {
      gotIt: '.js-twofas-pin-info-got-it',
      prev: '.js-twofas-pin-info-prev',
      next: '.js-twofas-pin-info-next',
      info: '.twofas-options-page-pin-info',
      slider: '.js-twofas-pin-info-slider'
    },
    hamburger: {
      element: '.js-twofas-options-menu-hamburger',
      content: '.js-twofas-options-menu-content'
    },
    autoSubmit: {
      toggle: 'input#twofas-auto-submit-switch',
      list: '.js-twofas-auto-submit-excluded-domain-list',
      exclude: '.js-twofas-auto-submit-excluded-domain-exclude',
      add: '.js-twofas-auto-submit-excluded-domain-add',
      importDefault: '.js-twofas-auto-submit-excluded-domain-import-default'
    },
    menuLink: '.js-twofas-menu-link',
    extVersion: 'span.twofas-ext-version',
    contextMenuInput: 'input#twofas-context-menu',
    logsInput: 'input#twofas-logs',
    testNotification: '.js-twofas-send-test-notification',
    devicesList: '.js-twofas-device-list',
    content: '.js-twofas-options-content',
    toggle: '.twofas-toggle',
    safariReset: '.js-twofas-safari-reset',
    integrityError: '.js-twofas-integrity-error'
  },
  notification: {
    container: 'div.twofas-be-notifications',
    notification: 'div.twofas-be-notification',
    visible: 'div.twofas-be-notification.visible'
  },
  extName: {
    input: 'input.js-twofas-extension-name',
    updateForm: '.js-twofas-extension-name-update',
    updateBtn: '.js-twofas-extension-name-update button',
    error: '.js-twofas-extension-name-error'
  },
  preload: '.preload'
};

export default selectors;
