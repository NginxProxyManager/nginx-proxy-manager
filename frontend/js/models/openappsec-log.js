const Backbone = require('backbone');

const model = Backbone.Model.extend({
    idAttribute: 'id',

    defaults: function () {
        return {
            name: '',
            eventSeverity: '',
            assetName: '',
            securityAction: '',
            waapIncidentType: '',
            httpSourceId: '',
            sourceIP: '',
            // 'Proxy-IP': '',
            proxyIP: '',
            httpHostName: '',
            httpMethod: '',
            // 'HTTP-Response-Code': '',
            httpResponseCode: '',
            httpUriPath: '',
            // 'Protection-Name': '',
            protectionName: '',
            matchedLocation: '',
            matchedParameter: '',
            matchedSample: '',
            eventPriority: '',
            eventTopic: '',
            eventName: '',
            // Suggested Remediation if Applicable
            suggestedRemediation: ''
        };
    }
});

module.exports = {
    Model:      model,
    Collection: Backbone.Collection.extend({
        model: model
    })
};
