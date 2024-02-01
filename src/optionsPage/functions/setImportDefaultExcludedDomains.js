const S = require('../../selectors');
const handleImportDefaultExcludedDomains = require('./handleImportDefaultExcludedDomains');

const setImportDefaultExcludedDomains = () => {
  const importDefaultListBtn = document.querySelector(S.optionsPage.autoSubmit.importDefault);
  importDefaultListBtn.addEventListener('click', handleImportDefaultExcludedDomains);
};

module.exports = setImportDefaultExcludedDomains;
