const UserModel = require('../models/user');

// 获取语言设置：优先级为 localStorage > 浏览器语言 > 默认中文
let getInitialLocale = function() {
    try {
        // 检查本地存储
        if (typeof localStorage !== 'undefined') {
            let saved = localStorage.getItem('locale');
            if (saved && ['zh', 'en', 'fr', 'jp', 'tw', 'kr', 'ru', 'pt'].includes(saved)) {
                return saved;
            }
        }
        
        // 检查浏览器语言
        if (typeof navigator !== 'undefined') {
            let browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
            if (browserLang.startsWith('zh-tw') || browserLang.startsWith('zh-hk')) {
                return 'tw';
            } else if (browserLang.startsWith('zh')) {
                return 'zh';
            } else if (browserLang.startsWith('en')) {
                return 'en';
            } else if (browserLang.startsWith('fr')) {
                return 'fr';
            } else if (browserLang.startsWith('ja')) {
                return 'jp';
            } else if (browserLang.startsWith('ko')) {
                return 'kr';
            } else if (browserLang.startsWith('ru')) {
                return 'ru';
            } else if (browserLang.startsWith('pt')) {
                return 'pt';
            }
        }
    } catch (e) {
        console.warn('Error accessing localStorage or navigator:', e);
    }
    
    // 默认使用中文
    return 'zh';
};

let cache = {
    User:    new UserModel.Model(),
    locale:  getInitialLocale(),
    version: null
};

module.exports = cache;

