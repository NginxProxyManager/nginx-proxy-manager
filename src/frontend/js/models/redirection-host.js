'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            id:                  0,
            created_on:          null,
            modified_on:         null,
            owner:               null,
            domain_name:         '',
            forward_domain_name: '',
            preserve_path:       false,
            ssl_enabled:         false,
            ssl_provider:        false,
            block_exploits:      false,
            meta:                []
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
