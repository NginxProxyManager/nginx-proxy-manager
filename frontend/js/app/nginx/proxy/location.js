const locationItemTemplate   = require('./location-item.ejs');
const Mn                     = require('backbone.marionette');
const App                    = require('../../main');

const LocationView = Mn.View.extend({
    template: locationItemTemplate,
    className: 'location_block',

    ui: {
        settings:   'input[type="checkbox"].settings-checkbox',
        static:     'input[type="checkbox"].location-static-checkbox',
        config:     '.config',
        delete:     '.location-delete'
    },

    events: {
			
        'change @ui.settings': function(el) {
            if (el.target.checked) {
                this.ui.config.show();
            } else {
                this.ui.config.hide();
            }
        },

        'change .model': function (e) {
					
            const map = {};

						let value = e.target.value
						if(e.target.type == 'checkbox') value = e.target.checked ? 1 : 0
            map[e.target.name] = value
            this.model.set(map);

						setTimeout(this.render.bind(this), 300)
						
        },

				// 'click @ui.static': 'render',

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