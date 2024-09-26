const SlimSelect = require('slim-select');
const browser = require('webextension-polyfill');
const saveToLocalStorage = require('../../localStorage/saveToLocalStorage');
const checkTabCS = require('../../background/functions/checkTabCS');

const setIconSelect = () => {
  // eslint-disable-next-line no-new
  new SlimSelect({
    select: '#twofas-icon-select',
    data: [
      {
        html: `<span><img src="${browser.runtime.getURL('images/icons/icon32.png')}" alt="Default" /><span>Default</span></span>`,
        text: 'Default',
        value: 0
      },
      {
        html: `<span><img src="${browser.runtime.getURL('images/icons/icon32_1.png')}" alt="Type1" /><span>Type 1</span></span>`,
        text: 'Type 1',
        value: 1
      }
    ],
    settings: {
      showSearch: false,
      closeOnSelect: true
    },
    events: {
      afterChange: async item => {
        const tabID = await browser.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0].id);

        await saveToLocalStorage({ extIcon: parseInt(item[0].value, 10) });
        await checkTabCS(tabID);
      }
    }
  });
};

module.exports = setIconSelect;
