'use strict';

const Mn         = require('backbone.marionette');
const template   = require('./main.ejs');
const HeaderView = require('./header/main');
const MenuView   = require('./menu/main');
const FooterView = require('./footer/main');
const Cache      = require('../cache');

module.exports = Mn.View.extend({
    className: 'page',
    template:  template,

    regions: {
        header_region:      {
            el:             '#header',
            replaceElement: true
        },
        menu_region:        {
            el:             '#menu',
            replaceElement: true
        },
        footer_region:      '.footer',
        app_content_region: '#app-content'
    },

    showAppContent: function (view) {
        this.showChildView('app_content_region', view);
    },

    onRender: function () {
        this.showChildView('header_region', new HeaderView({
            model: Cache.User
        }));

        this.showChildView('menu_region', new MenuView());
        this.showChildView('footer_region', new FooterView());
    },

    reset: function () {
        this.getRegion('header_region').reset();
        this.getRegion('footer_region').reset();
    }
});
