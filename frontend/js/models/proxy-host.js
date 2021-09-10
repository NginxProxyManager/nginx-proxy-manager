const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            id:                      undefined,
            created_on:              null,
            modified_on:             null,
            domain_names:            [],
            forward_scheme:          'http',
            forward_host:            '',
            forward_port:            null,
            access_list_id:          0,
            certificate_id:          0,
            ssl_forced:              false,
            hsts_enabled:            false,
            hsts_subdomains:         false,
            caching_enabled:         false,
            allow_websocket_upgrade: false,
            block_exploits:          false,
            http2_support:           false,
            advanced_config:         '',
            openidc_enabled:         false,
            openidc_redirect_uri:    '',
            openidc_discovery:       '',
            openidc_auth_method:     'client_secret_post',
            openidc_client_id:       '',
            openidc_client_secret:   '',
            openidc_restrict_users_enabled: false,
            openidc_allowed_users:   [],
            enabled:                 true,
            meta:                    {},
            // The following are expansions:
            owner:                   null,
            access_list:             null,
            certificate:             null
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
