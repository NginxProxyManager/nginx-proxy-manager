'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            id:              0,
            created_on:      null,
            modified_on:     null,
            owner:           null,
            incoming_port:   3000,
            forward_ip:      '',
            forwarding_port: 3000,
            tcp_forwarding:  true,
            udp_forwarding:  false,
            meta:            {}
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
