const Mn         = require('backbone.marionette');
const template   = require('./main.ejs');
const HeaderView = require('./header/main');
const MenuView   = require('./menu/main');
const FooterView = require('./footer/main');
const Cache      = require('../cache');

module.exports = Mn.View.extend({
    id:          'app',
    className:   'page',
    template:    template,
    modal_setup: false,

    modal: null,

    ui: {
        modal: '#modal-dialog'
    },

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
        app_content_region: '#app-content',
        modal_region:       '#modal-dialog'
    },

    /**
     * @param {Object}  view
     */
    showAppContent: function (view) {
        this.showChildView('app_content_region', view);
    },

    /**
     * @param {Object}    view
     * @param {Function}  [show_callback]
     * @param {Function}  [shown_callback]
     */
    showModalDialog: function (view, show_callback, shown_callback) {
        this.showChildView('modal_region', view);
        let modal = this.getRegion('modal_region').$el.modal('show');

        modal.on('hidden.bs.modal', function (/*e*/) {
            if (show_callback) {
                modal.off('show.bs.modal', show_callback);
            }

            if (shown_callback) {
                modal.off('shown.bs.modal', shown_callback);
            }

            modal.off('hidden.bs.modal');
            view.destroy();
        });

        if (show_callback) {
            modal.on('show.bs.modal', show_callback);
        }

        if (shown_callback) {
            modal.on('shown.bs.modal', shown_callback);
        }
    },

    /**
     *
     * @param {Function}  [hidden_callback]
     */
    closeModal: function (hidden_callback) {
        let modal = this.getRegion('modal_region').$el.modal('hide');

        if (hidden_callback) {
            modal.on('hidden.bs.modal', hidden_callback);
        }
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
        this.getRegion('modal_region').reset();
    }
});
