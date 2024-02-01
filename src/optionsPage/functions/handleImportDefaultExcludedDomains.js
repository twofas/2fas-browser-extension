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
