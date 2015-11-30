var winston = require( 'winston' ),
	fs = require( 'fs' ),
	logDir = 'log', // Or read from a configuration
	env = process.env.NODE_ENV || 'development',
	logger;

winston.setLevels( winston.config.npm.levels );
winston.addColors( winston.config.npm.colors );

if ( !fs.existsSync( logDir ) ) {
	// Create the directory if it does not exist
	fs.mkdirSync( logDir );
}
logger = new( winston.Logger )( {
	transports: [
		new winston.transports.Console( {
			level: env === 'development' ? 'debug' : 'info', // Only write logs of warn level or higher
			colorize: true
		} ),
		new winston.transports.File( {
			level: env === 'development' ? 'debug' : 'info',
			filename: logDir + '/logs.log',
			maxsize: 1024 * 1024 * 10 // 10MB
		} )
    ],
	exceptionHandlers: [
		new winston.transports.File( {
			filename: 'log/exceptions.log'
		} ),
		new winston.transports.Console( {
			colorize: true
		} ),
    ]
} );

module.exports = logger;

