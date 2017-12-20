const winston = require('winston');

winston.remove(winston.transports.Console);

winston.add(winston.transports.Console, {
    colorize:    true,
    timestamp:   true,
    prettyPrint: true,
    depth:       3
});

winston.setLevels({
    error:   0,
    warn:    1,
    info:    2,
    success: 2,
    verbose: 3,
    debug:   4
});

winston.addColors({
    error:   'red',
    warn:    'yellow',
    info:    'cyan',
    success: 'green',
    verbose: 'blue',
    debug:   'magenta'
});

module.exports = winston;
