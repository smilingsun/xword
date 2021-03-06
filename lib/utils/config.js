"use strict";

var path   = require('path');
var fs     = require('fs');
var _      = require('lodash');
var assert = require('assert');

var staticPath = path.resolve(__dirname, '..', '..', 'static');
var templatesPath = path.join(staticPath, 'templates');
var partialsPath = path.join(templatesPath, 'partials');

var Config = {
	"app": {
		"environment": process.env.NODE_ENV || 'development',
		"secret": process.env.CONFIG_APP_SECRET,
		"address": {
			"host": process.env.CONFIG_APP_ADDRESS_HOST,
			"port": process.env.PORT,
			"isSecure": !!process.env.CONFIG_APP_ADDRESS_IS_SECURE,
			"externalPort": process.env.CONFIG_APP_ADDRESS_EXTERNAL_PORT || null,
			"insecurePort": process.env.CONFIG_APP_ADDRESS_INSECURE_PORT || null
		}
	},
	"session": {
		"key": process.env.CONFIG_SESSION_KEY,
		"store": {
			"url": process.env.CONFIG_SESSION_STORE_URL
		}
	},
	"data": {
		"store": {
			"url": process.env.CONFIG_DATA_STORE_URL
		}
	},
	"paths": {
		"static": staticPath,
		"templates": templatesPath,
		"partials": partialsPath
	},
	"authentication": {
		"facebook": {
			"profileFields": [
				"id",
				"name",
				"displayName",
				"emails"
			],
			"scope": [
				"email"
			],
			"callbackURL": "/auth/fb/callback"
		},
		"google": {
			"scope": ["https://www.googleapis.com/auth/plus.login", "email"],
			"callbackURL": "/auth/google/callback"
		}
	},
	"credentials": {
		"facebook": {
			"appSecret": process.env.CONFIG_CREDENTIALS_FACEBOOK_APP_SECRET,
			"appID": process.env.CONFIG_CREDENTIALS_FACEBOOK_APP_ID
		},
		"google": {
			"clientSecret": process.env.CONFIG_CREDENTIALS_GOOGLE_CLIENT_SECRET,
			"clientID": process.env.CONFIG_CREDENTIALS_GOOGLE_CLIENT_ID
		}
	},
	"ssl": {
		"key": _.isUndefined(process.env.CONFIG_SSL_KEY) ?
			(
				_.isString(process.env.CONFIG_SSL_KEY_PATH) ?
					fs.readFileSync(process.env.CONFIG_SSL_KEY_PATH).toString() :
					undefined
			) :
			process.env.CONFIG_SSL_KEY,
		"cert": _.isUndefined(process.env.CONFIG_SSL_CERT) ?
			(
				_.isString(process.env.CONFIG_SSL_CERT_PATH) ?
					fs.readFileSync(process.env.CONFIG_SSL_CERT_PATH).toString() :
					undefined
			) :
			process.env.CONFIG_SSL_CERT
	}
};

assert(
	!Config.app.address.isSecure || (Config.ssl.key && Config.ssl.cert),
	"Both `ssl.key` and `ssl.cert` are required to run a secure server"
);

exports = module.exports = Config;
