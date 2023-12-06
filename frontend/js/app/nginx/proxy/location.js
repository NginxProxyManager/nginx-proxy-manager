const locationItemTemplate   = require('./location-item.ejs');
const Mn                     = require('backbone.marionette');
const App                    = require('../../main');

const LocationView = Mn.View.extend({
    template: locationItemTemplate,
    className: 'location_block',

    ui: {
        use_openappsec:           'input[name="use_openappsec"]',
        openappsec_mode:          'select[name="openappsec_mode"]',
        minimum_confidence:       'select[name="minimum_confidence"]',
        toggle:     'input[type="checkbox"]#advanced_config_toggle',
        config:     '.config',
        delete:     '.location-delete'
    },

    events: {
        'change @ui.toggle': function(el) {
            if (el.target.checked) {
                this.ui.config.show();
            } else {
                this.ui.config.hide();
            }
        },

        'change @ui.use_openappsec': function () {
            let checked = this.ui.use_openappsec.prop('checked');
            this.model.set('use_openappsec', checked);

            this.ui.openappsec_mode
                .prop('disabled', !checked)
                .parents('.form-group')
                .css('opacity', checked ? 1 : 0.5);

            this.ui.minimum_confidence
                .prop('disabled', !checked)
                .parents('.form-group')
                .css('opacity', checked ? 1 : 0.5);

            /*** check this */
            if (!checked) {
                this.ui.openappsec_mode.prop('checked', false);
            }
        },

        // input fields with the class 'model' will automatically update the model.
        'change .model': function (e) {
            const map = {};
            map[e.target.name] = e.target.value;
            this.model.set(map);
        },

        'click @ui.delete': function () {
            this.model.destroy();
        }
    },

    onRender: function() {
        $(this.ui.config).hide();
    },

    templateContext: function() {
        return {
            i18n: App.i18n
        }
    }
});

const LocationCollectionView = Mn.CollectionView.extend({
    className: 'locations_container',
    childView: LocationView
});

module.exports = {
    LocationCollectionView,
    LocationView
}