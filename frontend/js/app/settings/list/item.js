const Mn       = require('backbone.marionette');
const App      = require('../../main');
const Cache    = require('../../cache');
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
            if (newLocale && ['zh', 'en', 'fr', 'jp', 'tw', 'kr', 'ru', 'pt'].includes(newLocale)) {
                localStorage.setItem('locale', newLocale);
                Cache.locale = newLocale;
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
