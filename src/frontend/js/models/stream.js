'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            created_on:      null,
            modified_on:     null,
            owner:           null,
            incoming_port:   0,
            forward_ip:      '',
            forwarding_port: 0,
            tcp_forwarding:  true,
            udp_forwarding:  false,
            meta:            []
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
