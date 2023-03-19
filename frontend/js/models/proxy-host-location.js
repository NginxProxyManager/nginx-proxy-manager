const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function() {
        return {
            opened:             false,
            path:               '',
            advanced_config:    'proxy_set_header Host $host;\n' + 
                                'proxy_set_header X-Forwarded-Scheme $scheme;\n' + 
                                'proxy_set_header X-Forwarded-Proto  $scheme;\n' + 
                                'proxy_set_header X-Forwarded-For    $remote_addr;\n' + 
                                'proxy_set_header X-Real-IP          $remote_addr;',
            forward_scheme:     'http',
            forward_host:       '',
            forward_port:       '80'
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