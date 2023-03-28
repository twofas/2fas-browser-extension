const browser = require('webextension-polyfill');
const config = require('../../config');
const TwoFasNotification = require('../../notification');
const showConfirmModal = require('./showConfirmModal');
const clearLocalStorage = require('../../localStorage/clearLocalStorage');
const storeLog = require('../../partials/storeLog');
const delay = require('../../partials/delay');

const handleSafariReset = () => {
  showConfirmModal(
    browser.i18n.getMessage('modalSafariResetHeader'),
    browser.i18n.getMessage('modalSafariResetText'),
    () => {
      return clearLocalStorage()
        .then(() => TwoFasNotification.show(config.Texts.Success.SafariReset))
        .then(() => delay(() => browser.runtime.sendMessage({ action: 'storageReset' }).then(() => window.location.reload()), 2000))
        .catch(async err => {
          await storeLog('error', 36, err, 'handleSafariReset');
          return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
        });
    }
  );
};

module.exports = handleSafariReset;
