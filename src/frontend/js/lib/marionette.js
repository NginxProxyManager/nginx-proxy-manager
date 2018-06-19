'use strict';

const _       = require('underscore');
const Mn      = require('backbone.marionette');
const moment  = require('moment');
const numeral = require('numeral');

let render = Mn.Renderer.render;

Mn.Renderer.render = function (template, data, view) {

    data = _.clone(data);

    /**
     * @param   {Integer} number
     * @returns {String}
     */
    data.niceNumber = function (number) {
        return numeral(number).format('0,0');
    };

    /**
     * @param   {Integer} seconds
     * @returns {String}
     */
    data.secondsToTime = function (seconds) {
        let sec_num = parseInt(seconds, 10);
        let minutes = Math.floor(sec_num / 60);
        let sec     = sec_num - (minutes * 60);

        if (sec < 10) {
            sec = '0' + sec;
        }

        return minutes + ':' + sec;
    };

    /**
     * @param   {String} date
     * @returns {String}
     */
    data.shortDate = function (date) {
        let shortdate = '';

        if (typeof date === 'number') {
            shortdate = moment.unix(date).format('YYYY-MM-DD');
        } else {
            shortdate = moment(date).format('YYYY-MM-DD');
        }

        return moment().format('YYYY-MM-DD') === shortdate ? 'Today' : shortdate;
    };

    /**
     * @param   {String} date
     * @returns {String}
     */
    data.shortTime = function (date) {
        let shorttime = '';

        if (typeof date === 'number') {
            shorttime = moment.unix(date).format('H:mm A');
        } else {
            shorttime = moment(date).format('H:mm A');
        }

        return shorttime;
    };

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

    /**
     * @param   {String} name
     * @returns {String}
     */
    data.niceVarName = function (name) {
        return name.replace('_', ' ')
            .replace(/^(.)|\s+(.)/g, function ($1) {
                return $1.toUpperCase();
            });
    };

    return render.call(this, template, data, view);
};

module.exports = Mn;
