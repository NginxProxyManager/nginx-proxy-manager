'use strict';

const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            id:                  0,
            created_on:          null,
            modified_on:         null,
            domain_names:        [],
            forward_domain_name: '',
            preserve_path:       true,
            certificate_id:      0,
            ssl_forced:          false,
            block_exploits:      false,
            meta:                {},
            // The following are expansions:
            owner:               null,
            certificate:         null
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
