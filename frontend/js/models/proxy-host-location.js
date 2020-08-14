const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function() {
        return {
            opened:             false,
            path:               '',
            advanced_config:    '',
            forward_scheme:     'http',
            forward_host:       null,
            forward_port:       '80',
						root_dir:						null,
						static:							false,
						index_file:					'index.html',
        }
    },

    toJSON() {
        const r = Object.assign({}, this.attributes);
        delete r.opened;
        return r;
    },

    toggleVisibility: function () {
        this.save({
            opened: !this.get('opened')
        });
    }
})

module.exports = {
    Model: model,
    Collection: Backbone.Collection.extend({
        model
    })
}