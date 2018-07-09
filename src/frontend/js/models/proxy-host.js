'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            created_on:      null,
            modified_on:     null,
            owner:           null,
            domain_name:     '',
            forward_ip:      '',
            forward_port:    null,
            access_list_id:  null,
            ssl_enabled:     false,
            ssl_provider:    false,
            ssl_forced:      false,
            caching_enabled: false,
            block_exploits:  false,
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
