const Mn       = require('backbone.marionette');
const App      = require('../../main');
const Cache    = require('../../cache');
const i18n     = require('../../i18n');
const template = require('./item.ejs');

module.exports = Mn.View.extend({
    template: template,
    tagName:  'tr',

    ui: {
        edit: 'a.edit',
        languageSelector: '.language-selector'
    },

    events: {
        'click @ui.edit': function (e) {
            e.preventDefault();
            App.Controller.showSettingForm(this.model);
        },

        'change @ui.languageSelector': function (e) {
            e.preventDefault();
            let newLocale = $(e.currentTarget).val();
            if (newLocale && ['zh-CN', 'en-US', 'fr-FR', 'ja-JP', 'zh-TW', 'ko-KR', 'ru-RU', 'pt-PT'].includes(newLocale)) {
                console.log('Language selector changed to:', newLocale);
                
                // 清理i18n缓存
                if (typeof i18n.clearCache === 'function') {
                    i18n.clearCache();
                }
                
                // 更新缓存和本地存储
                localStorage.setItem('locale', newLocale);
                Cache.locale = newLocale;
                
                // 重新初始化i18n系统
                if (typeof i18n.initialize === 'function') {
                    i18n.initialize(true);
                }
                
                console.log('Reloading page to apply new language:', newLocale);
                // 重新加载页面以应用新语言
                window.location.reload();
            }
        }
    },

    templateContext: function() {
        return {
            locale: Cache.locale
        };
    },

    initialize: function () {
        this.listenTo(this.model, 'change', this.render);
    }
});
