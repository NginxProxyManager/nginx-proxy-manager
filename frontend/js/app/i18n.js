const Cache    = ('./cache');
const messages = require('../i18n/messages.json');

/**
 * @param {String}  namespace
 * @param {String}  key
 * @param {Object}  [data]
 */
module.exports = function (namespace, key, data) {
    let locale = Cache.locale;
    // check that the locale exists
    if (typeof messages[locale] === 'undefined') {
        locale = 'en';
    }

    if (typeof messages[locale][namespace] !== 'undefined' && typeof messages[locale][namespace][key] !== 'undefined') {
        return messages[locale][namespace][key](data);
    } else if (locale !== 'en' && typeof messages['en'][namespace] !== 'undefined' && typeof messages['en'][namespace][key] !== 'undefined') {
        return messages['en'][namespace][key](data);
    }

    return '(MISSING: ' + namespace + '/' + key + ')';
};
