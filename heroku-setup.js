"use strict";

var debug = require('debug')('xword:heroku-setup');

process.env.CONFIG_SESSION_STORE_URL = process.env.MONGOLAB_URI;
process.env.CONFIG_DATA_STORE_URL = process.env.MONGOLAB_URI;
