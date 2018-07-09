const {Signale} = require('signale');

module.exports = {
    global:  new Signale({scope: 'Global    '}),
    migrate: new Signale({scope: 'Migrate   '}),
    express: new Signale({scope: 'Express   '}),
    access:  new Signale({scope: 'Access    '})
};
