'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: '_id',

    defaults: function () {
        return {
            type:              'proxy',
            hostname:          '',
            forward_server:    '',
            forward_host:      '',
            forward_port:      80,
            asset_caching:     false,
            block_exploits:    true,
            ssl:               false,
            ssl_expires:       0,
            force_ssl:         false,
            letsencrypt_email: '',
            accept_tos:        false,
            access_list_id:    '',
            advanced:          '',
            incoming_port:     0,
            protocols:         []
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
