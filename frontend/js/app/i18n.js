const Cache = require('./cache');

/**
 * @param {String}  namespace
 * @param {String}  key
 * @param {Object}  [data]
 */
module.exports = function (namespace, key, data) {
    let locale = Cache.locale;
    messages = require('../i18n/en-lang.json');

    if (typeof messages[namespace] !== 'undefined' && typeof messages[namespace][key] !== 'undefined') {
        return messages[namespace][key](data);
    } else {
        return `(MISSING: ${namespace}.${key})`;
    }
};
