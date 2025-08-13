const Cache = require('./cache');

// 使用分离的语言文件
let messages = {};

function loadMessages(locale) {
    if (!messages[locale]) {
        try {
            messages[locale] = require('../i18n/' + locale + '.json');
            console.info('Successfully loaded language file:', locale);
        } catch (e) {
            console.error('Language file not found for locale:', locale, e);
            // 如果找不到语言文件，尝试加载英文作为后备
            if (locale !== 'en') {
                try {
                    messages[locale] = require('../i18n/en.json');
                    console.warn('Using English fallback for locale:', locale);
                } catch (fallbackError) {
                    console.error('Failed to load fallback language file (en.json):', fallbackError);
                    messages[locale] = {};
                }
            } else {
                console.error('Failed to load English language file');
                messages[locale] = {};
            }
        }
    }
    return messages[locale];
}

/**
 * @param {String}  namespace
 * @param {String}  key
 * @param {Object}  [data]
 */
module.exports = function (namespace, key, data) {
    let locale = Cache.locale;
    let currentMessages = loadMessages(locale);
    
    // 检查当前语言是否有对应的翻译
    if (currentMessages && currentMessages[namespace] && typeof currentMessages[namespace][key] !== 'undefined') {
        try {
            return currentMessages[namespace][key](data);
        } catch (formatError) {
            console.error('Error formatting message:', namespace, key, formatError);
            return currentMessages[namespace][key].toString();
        }
    } 
    
    // 如果当前语言没有翻译，尝试使用英文作为后备
    if (locale !== 'en') {
        let enMessages = loadMessages('en');
        if (enMessages && enMessages[namespace] && typeof enMessages[namespace][key] !== 'undefined') {
            try {
                return enMessages[namespace][key](data);
            } catch (formatError) {
                console.error('Error formatting English fallback message:', namespace, key, formatError);
                return enMessages[namespace][key].toString();
            }
        }
    }

    console.warn('Missing translation:', namespace + '/' + key, 'for locale:', locale);
    return '(MISSING: ' + namespace + '/' + key + ')';
};
