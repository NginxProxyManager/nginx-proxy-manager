const UserModel = require('../models/user');

// 获取语言设置：优先级为 localStorage > 浏览器语言 > 默认英文
let getInitialLocale = function() {
    try {
        // 检查本地存储
        if (typeof localStorage !== 'undefined') {
            let saved = localStorage.getItem('locale');
            if (saved && ['zh-CN', 'en-US', 'fr-FR', 'ja-JP', 'zh-TW', 'ko-KR', 'ru-RU', 'pt-PT'].includes(saved)) {
                return saved;
            }
        }
        
        // 检查浏览器语言
        if (typeof navigator !== 'undefined') {
            let browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
            if (browserLang.startsWith('zh-tw') || browserLang.startsWith('zh-hk')) {
                return 'zh-TW';
            } else if (browserLang.startsWith('zh')) {
                return 'zh-CN';
            } else if (browserLang.startsWith('en')) {
                return 'en-US';
            } else if (browserLang.startsWith('fr')) {
                return 'fr-FR';
            } else if (browserLang.startsWith('ja')) {
                return 'ja-JP';
            } else if (browserLang.startsWith('ko')) {
                return 'ko-KR';
            } else if (browserLang.startsWith('ru')) {
                return 'ru-RU';
            } else if (browserLang.startsWith('pt')) {
                return 'pt-PT';
            }
        }
    } catch (e) {
        console.warn('Error accessing localStorage or navigator:', e);
    }
    
    // 默认使用英文作为最安全的后备语言
    return 'en-US';
};

// 尝试从DOM获取初始版本号
let getInitialVersion = function() {
    try {
        if (typeof document !== 'undefined') {
            const appElement = document.getElementById('app');
            if (appElement && appElement.dataset.version) {
                return appElement.dataset.version;
            }
            
            const loginElement = document.getElementById('login');
            if (loginElement && loginElement.dataset.version) {
                return loginElement.dataset.version;
            }
        }
    } catch (e) {
        console.warn('Error getting initial version:', e);
    }
    return null;
};

let cache = {
    User:    new UserModel.Model(),
    locale:  getInitialLocale(),
    version: getInitialVersion()
};

module.exports = cache;

