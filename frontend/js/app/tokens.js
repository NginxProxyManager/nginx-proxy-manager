const STORAGE_NAME = 'nginx-proxy-manager-tokens';

/**
 * @returns {Array}
 */
const getStorageTokens = function () {
    let json = window.localStorage.getItem(STORAGE_NAME);
    if (json) {
        try {
            return JSON.parse(json);
        } catch (err) {
            return [];
        }
    }

    return [];
};

/**
 * @param  {Array}  tokens
 */
const setStorageTokens = function (tokens) {
    window.localStorage.setItem(STORAGE_NAME, JSON.stringify(tokens));
};

const Tokens = {

    /**
     * @returns {Number}
     */
    getTokenCount: () => {
        return getStorageTokens().length;
    },

    /**
     * @returns {Object}    t,n
     */
    getTopToken: () => {
        let tokens = getStorageTokens();
        if (tokens && tokens.length) {
            return tokens[0];
        }

        return null;
    },

    /**
     * @returns {String}
     */
    getNextTokenName: () => {
        let tokens = getStorageTokens();
        if (tokens && tokens.length > 1 && typeof tokens[1] !== 'undefined' && typeof tokens[1].n !== 'undefined') {
            return tokens[1].n;
        }

        return null;
    },

    /**
     *
     * @param   {String}  token
     * @param   {String}  [name]
     * @returns {Number}
     */
    addToken: (token, name) => {
        // Get top token and if it's the same, ignore this call
        let top = Tokens.getTopToken();
        if (!top || top.t !== token) {
            let tokens = getStorageTokens();
            tokens.unshift({t: token, n: name || null});
            setStorageTokens(tokens);
        }

        return Tokens.getTokenCount();
    },

    /**
     * @param   {String}  token
     * @returns {Boolean}
     */
    setCurrentToken: token => {
        let tokens = getStorageTokens();
        if (tokens.length) {
            tokens[0].t = token;
            setStorageTokens(tokens);
            return true;
        }

        return false;
    },

    /**
     * @param   {String}  name
     * @returns {Boolean}
     */
    setCurrentName: name => {
        let tokens = getStorageTokens();
        if (tokens.length) {
            tokens[0].n = name;
            setStorageTokens(tokens);
            return true;
        }

        return false;
    },

    /**
     * @returns {Number}
     */
    dropTopToken: () => {
        let tokens = getStorageTokens();
        tokens.shift();
        setStorageTokens(tokens);
        return tokens.length;
    },

    /**
     *
     */
    clearTokens: () => {
        window.localStorage.removeItem(STORAGE_NAME);
    }

};

module.exports = Tokens;
