'use strict';

import _ from 'underscore';
import Mn from 'backbone.marionette';

let render         = Mn.Renderer.render;
Mn.Renderer.render = function (template, data, view) {
    data = _.clone(data);

    /**
     * @param   {String} string
     * @returns {String}
     */
    data.escape = function (string) {
        let entityMap = {
            '&':  '&amp;',
            '<':  '&lt;',
            '>':  '&gt;',
            '"':  '&quot;',
            '\'': '&#39;',
            '/':  '&#x2F;'
        };

        return String(string).replace(/[&<>"'\/]/g, function (s) {
            return entityMap[s];
        });
    };

    /**
     * @param   {String} string
     * @param   {Integer} length
     * @returns {String}
     */
    data.trim = function (string, length) {
        if (string.length > length) {
            let trimmedString = string.substr(0, length);
            return trimmedString.substr(0, Math.min(trimmedString.length, trimmedString.lastIndexOf(' '))) + '...';
        }

        return string;
    };

    return render.call(this, template, data, view);
};

module.exports = Mn;
