const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            id:                undefined,
            created_on:        null,
            modified_on:       null,
            provider:          '',
            nice_name:         '',
            domain_names:      [],
            expires_on:        null,
            meta:              {},
            // The following are expansions:
            owner:             null,
            proxy_hosts:       [],
            redirection_hosts: [],
            dead_hosts:        []
        };
    },

    /**
     * @returns {Boolean}
     */
    hasSslFiles: function () {
        let meta = this.get('meta');
        return typeof meta['certificate'] !== 'undefined' && meta['certificate'] && typeof meta['certificate_key'] !== 'undefined' && meta['certificate_key'];
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
