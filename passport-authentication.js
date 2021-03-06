"use strict";

var _                = require('lodash');
var passport         = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;
var GoogleStrategy   = require('passport-google-oauth').OAuth2Strategy;
var LocalStrategy    = require('passport-local').Strategy;
var UserStore        = require('./lib/persistence/stores/user');
var UserModel        = require('./lib/persistence/models/user');
var config           = require('./lib/utils/config');

var baseCallbackURL = "http" + (config.app.address.isSecure ? "s" : "") + "://" + config.app.address.host;
var port = config.app.address.externalPort && Number(config.app.address.externalPort);

// If the port is 80, don't bother adding it
if (port && port !== 80) {
	baseCallbackURL += ":" + port;
}

var facebookCallbackURL = baseCallbackURL + config.authentication.facebook.callbackURL;

var googleCallbackUrl = baseCallbackURL + config.authentication.google.callbackURL;

passport.serializeUser(function(user, done) {
	done(null, user._id);
});

passport.deserializeUser(function(id, done) {
	UserStore.getUserByID(id).done(function(user) {
		done(null, user);
	});
});

passport.use(
	new FacebookStrategy(
		{
			clientID         : config.credentials.facebook.appID,
			clientSecret     : config.credentials.facebook.appSecret,
			callbackURL      : facebookCallbackURL,
			profileFields    : config.authentication.facebook.profileFields,
			passReqToCallback: true
		},
		function(req, accessToken, refreshToken, profile, done) {
			if (!profile) {
				done(new Error('Got no profile'));
				return;
			}

			UserStore.getUser({
				filters: {
					facebookId: profile.id
				}
			}).then(
				function(user) {
					if (user) {
						return user;
					}

					var email;

					if (profile.emails && profile.emails.length > 0) {
						email = profile.emails[0].value;
					}

					var username = profile.username || email;

					return UserStore.addUser(
						new UserModel({
							username: username,
							facebookId: profile.id,
							preferredDisplayName: profile.displayName,
							profilePhotoURL: "https://graph.facebook.com/" + profile.id +"/picture?type=square",
							name: {
								first: profile.name.givenName,
								last: profile.name.familyName,
								middle: profile.name.middleName,
							},
							email: email,
						})
					);
				}
			).done(
				function(user) {
					done(null, user);
				},
				function(err) {
					done(err);
				}
			);
		}
	)
);

passport.use(new GoogleStrategy(
	{
		clientID: config.credentials.google.clientID,
		clientSecret: config.credentials.google.clientSecret,
		callbackURL: googleCallbackUrl
	},
	function(token, tokenSecret, profile, done) {
		if (!profile) {
			done(new Error('Got no profile'));
			return;
		}

		UserStore.getUser({
			filters: {
				googleId: profile.id
			}
		}).then(
			function(user) {
				if (user) {
					return user;
				}

				var email;

				if (profile.emails && profile.emails.length > 0) {
					email = profile.emails[0].value;
				}

				var username = profile.username || email || 'google-' + profile.id;

				var image;

				if (_.size(profile.photos) > 0) {
					image = profile.photos[0].value;
				}

				return UserStore.addUser(
					new UserModel({
						username: username,
						googleId: profile.id,
						preferredDisplayName: profile.displayName,
						profilePhotoURL: image,
						name: {
							first: profile.name.givenName,
							last: profile.name.familyName
						},
						email: email,
					})
				);
			}
		).done(
			function(user) {
				done(null, user);
			},
			function(err) {
				done(err);
			}
		);
	}
));

passport.use(new LocalStrategy(
	function(username, password, done) {
		UserStore.getUser({
			filters: {
				username: username
			}
		}).then(
			function(user) {
				if (!user) {
					done(null, false);
				}

				// check password
				var passwordVerified = true;

				if (passwordVerified) {
					return done(null, user);
				}

				return done(null, false);
			},
			function(err) {
				done(err);
			}
		);
  }
));

module.exports = function(app) {
	app.use(passport.initialize());
	app.use(passport.session());
};
