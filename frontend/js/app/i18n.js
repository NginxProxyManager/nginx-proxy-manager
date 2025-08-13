// 使用分离的语言文件
let messages = {};
let isInitialized = false;
let currentLocale = null;

// 使用 webpack 的 require.context 显式包含可用语言资源，避免动态 require 被丢弃
let localesContext = null;
try {
    // 仅匹配现有语言文件；使用完整的locale格式
    localesContext = require.context('../i18n', false, /^\.\/(en-US|zh-CN|zh-TW|fr-FR|ja-JP|ko-KR|ru-RU|pt-PT)\.json$/);
} catch (e) {
    // 非 webpack 环境下忽略
    localesContext = null;
}

// 预加载英文作为默认后备语言
function preloadEnglish() {
    if (!messages['en-US']) {
        try {
            let mod = localesContext ? localesContext('./en-US.json') : require('../i18n/en-US.json');
            // 规范化 ESModule default 导出
            messages['en-US'] = (mod && mod.default) ? mod.default : mod;
            console.info('Pre-loaded English language file as fallback');
            
            // 验证基本结构
            if (messages['en-US'] && typeof messages['en-US'] === 'object') {
                if (messages['en-US'].str && messages['en-US'].login) {
                    console.info('English language file structure validated');
                } else {
                    console.warn('English language file missing expected sections:', Object.keys(messages['en-US']));
                }
            } else {
                console.warn('English language file is not an object:', typeof messages['en-US']);
            }
        } catch (e) {
            console.error('Critical: Failed to load English language file:', e);
            messages['en-US'] = {};
        }
    }
}

// 获取 Cache 的函数，避免循环依赖问题
function getCache() {
    try {
        return require('./cache');
    } catch (e) {
        console.warn('Cache module not available during initialization');
        return { locale: 'en' };
    }
}

// 清理缓存函数
function clearCache() {
    console.log('Clearing i18n cache...');
    messages = {};
    isInitialized = false;
    currentLocale = null;
}

// 初始化函数 - 确保基础语言文件已加载
function initialize(forceReload = false) {
    let Cache = getCache();
    let newLocale = Cache.locale || 'en';
    
    // 如果语言发生变化，清理缓存
    if (currentLocale && currentLocale !== newLocale) {
        console.log('Language changed from', currentLocale, 'to', newLocale, 'clearing cache');
        clearCache();
    }
    
    if (isInitialized && !forceReload && currentLocale === newLocale) {
        return;
    }
    
    console.log('Initializing i18n system with locale:', newLocale);
    preloadEnglish();
    
    // 预加载当前设置的语言
    loadMessages(newLocale);
    
    currentLocale = newLocale;
    isInitialized = true;
    console.log('i18n system initialized successfully');
}

function loadMessages(locale) {
    // 确保英文后备语言已加载
    preloadEnglish();
    
    if (!messages[locale]) {
        try {
            console.log('Loading language file for locale:', locale);
            let mod = localesContext ? localesContext('./' + locale + '.json') : require('../i18n/' + locale + '.json');
            // 规范化 ESModule default 导出
            messages[locale] = (mod && mod.default) ? mod.default : mod;
            console.info('Successfully loaded language file:', locale);
            
            // 验证基本结构
            if (messages[locale] && typeof messages[locale] === 'object') {
                console.info('Language file structure for', locale, ':', Object.keys(messages[locale]));
            } else {
                console.warn('Language file is not an object for locale:', locale, typeof messages[locale]);
            }
        } catch (e) {
            console.error('Language file not found for locale:', locale, e);
            // 如果找不到语言文件，使用英文作为后备
            if (locale !== 'en-US') {
                console.warn('Using English fallback for locale:', locale);
                messages[locale] = messages['en-US'] || {};
            } else {
                console.error('Failed to load English language file');
                messages[locale] = {};
            }
        }
    } else {
        console.debug('Language file already loaded for locale:', locale);
    }
    return messages[locale];
}

/**
 * 主翻译函数
 * @param {String}  namespace
 * @param {String}  key
 * @param {Object}  [data]
 */
function translate(namespace, key, data) {
    try {
        let Cache = getCache();
        let locale = Cache.locale || 'en'; // 确保总是有一个有效的locale
        
        // 检查语言是否发生变化，如果变化则重新初始化
        if (currentLocale !== locale) {
            console.log('Detected locale change in translate function:', currentLocale, '->', locale);
            initialize(true); // 强制重新初始化
        }
        
        // 确保系统已初始化
        if (!isInitialized) {
            initialize();
        }
        
        let currentMessages = loadMessages(locale);
        
        // 如果没有加载到任何消息，强制使用英文
        if (!currentMessages) {
            console.warn('No messages loaded for locale:', locale, 'forcing English');
            currentMessages = loadMessages('en');
            locale = 'en';
        }
        
        // MessageFormat loader保持JSON结构，只是将字符串转换为函数
        // 尝试获取翻译
        function getTranslation(messages, namespace, key, data) {
            if (!messages || typeof messages !== 'object') {
                return null;
            }
            
            if (messages[namespace] && typeof messages[namespace][key] !== 'undefined') {
                try {
                    let value = messages[namespace][key];
                    // MessageFormat loader将字符串转换为函数
                    if (typeof value === 'function') {
                        return value(data || {});
                    } else {
                        // 如果还是字符串，直接返回
                        return value;
                    }
                } catch (formatError) {
                    console.error('Error formatting message:', namespace, key, formatError);
                    // 尝试返回原始值
                    try {
                        return messages[namespace][key].toString();
                    } catch (e) {
                        return null;
                    }
                }
            }
            return null;
        }
        
        // 尝试从当前语言获取翻译
        let result = getTranslation(currentMessages, namespace, key, data);
        if (result !== null) {
            return result;
        }
        
        // 如果当前语言没有翻译，尝试使用英文作为后备
        if (locale !== 'en') {
            let enMessages = loadMessages('en');
            result = getTranslation(enMessages, namespace, key, data);
            if (result !== null) {
                return result;
            }
        }

        console.warn('Missing translation:', namespace + '/' + key, 'for locale:', locale);
        return '(MISSING: ' + namespace + '/' + key + ')';
        
    } catch (criticalError) {
        console.error('Critical error in i18n translate function:', criticalError);
        // 返回一个安全的fallback
        return key || '(ERROR)';
    }
}

// 导出主翻译函数和相关函数
module.exports = translate;
module.exports.initialize = initialize;
module.exports.clearCache = clearCache;
