const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            id:              undefined,
            created_on:      null,
            modified_on:     null,
            incoming_port:   null,
            forwarding_host: null,
            forwarding_port: null,
            tcp_forwarding:  true,
            udp_forwarding:  false,
            enabled:         true,
            meta:            {},
            certificate_id:  0,
            domain_names:    [],
            // The following are expansions:
            owner:           null,
            certificate:     null
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
