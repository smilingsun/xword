"use strict";

const debug = require('debug')('xword:build');

const _                    = require('lodash');
const path                 = require('path');
const fs                   = require('fs');
const dirRecurse           = require('recursive-readdir');
const Q                    = require('q');
const del                  = require('del');
const pkg                  = require('./package.json');

const gulp                 = require('gulp');
const gulpIf               = require('gulp-if');
const jshint               = require('gulp-jshint');
const gutil                = require('gulp-util');
const gulpDebug            = require('gulp-debug');
const sourcemaps           = require('gulp-sourcemaps');
const rename               = require('gulp-rename');
const less                 = require('gulp-less');
const uglify               = require('gulp-uglify');
const watch                = require('gulp-watch');
const plumber              = require('gulp-plumber');
const changed              = require('gulp-changed');
const jsdoc                = require('gulp-jsdoc3');
const runSequence          = require('run-sequence');

const watchify             = require('watchify');
const browserify           = require('browserify');
const hbsfy                = require('hbsfy');
const babelify             = require('babelify');
const uglifyify            = require('uglifyify');
const source               = require('vinyl-source-stream');
const buffer               = require('vinyl-buffer');
const merge                = require('merge-stream');
const stylish              = require('jshint-stylish');
const pump                 = require('pump');

const LessPluginCleanCSS   = require('less-plugin-clean-css');
const LessPluginAutoPrefix = require('less-plugin-autoprefix');

const cleancss             = new LessPluginCleanCSS({ advanced: true });
const autoprefix           = new LessPluginAutoPrefix({ browsers: ["last 2 versions"] });

const realFavicon          = require ('gulp-real-favicon');

const config               = require('./lib/utils/config');


const IS_DEVELOPMENT = config.app.environment === 'development';

const stylesDirectory = path.join(config.paths.static, 'styles');

const partialsDirectory = path.join(config.paths.templates, 'partials');

const jsDirectory = path.join(config.paths.static, 'scripts');

const jsViewsDirectory = path.join(jsDirectory, 'views');

const documentationDirectory = path.join(__dirname, 'docs');

const currentVersionDocumentationDirectory = path.join(documentationDirectory, pkg.name, pkg.version);

const thirdPartyJS = [path.join(config.paths.static, 'node_modules', 'bootstrap', 'dist', 'js', 'bootstrap.js')];

const jsBlob = path.join(jsDirectory, '**/*.{js,es6}');

const partialsBlob = path.join(partialsDirectory, '**/*.hbs');

const hbsSuffixRegex = /\.hbs$/;

const es6SuffixRegex = /\.es6$/;

const jsSuffixRegex = /\.js$/;

const partialsFile = path.resolve(jsDirectory, 'partials.js');

const viewMapFile = path.resolve(jsDirectory, 'view-map.es6');

const faviconDirectory = path.join(config.paths.static, 'dist', 'favicons/');


const browserifyOptions = _.extend({}, watchify.args, {
	debug: true,
	extensions: ['.es6', '.js', '.json']
});

const hbsfyOptions = {
	extensions: ['hbs'],
	precompiler: 'handlebars'
};

const babelifyOptions = {
	sourceRoot: jsDirectory,
	presets: ['es2015'],
	extensions: ['.es6'],
	comments: IS_DEVELOPMENT,
	babelrc: false
};

const uglifyifyOptions = {
	global: true,
	compress: true,
	mangle: true,
};

function _cleanDocumentation() {
	return Q(del(path.join(currentVersionDocumentationDirectory, '*'))).
		then(
			function() {
				const deferred = Q.defer();

				fs.readdir(documentationDirectory, function(err, files) {
					if (err) {
						deferred.reject(err);
						return;
					}

					let failed = false;

					_.each(files, function(file) {
						try {
							const filePath = path.join(documentationDirectory, file);
							const stat = fs.lstatSync(filePath);

							if (stat.isSymbolicLink()) {
								fs.unlinkSync(filePath);
							}
						}
						catch(ex) {
							deferred.reject(ex);
							failed = true;
							return false;
						}
					});

					if (!failed) {
						deferred.resolve();
					}
				});

				return deferred.promise;
			}
		);
}

function _buildDocumentation() {
	const deferred = Q.defer();

	fs.readFile('./.jsdocrc', { encoding: 'utf8' }, function(err, configText) {
		if (err) {
			deferred.reject(err);
			return;
		}

		const jsdocConfig = JSON.parse(configText);

		jsdocConfig.opts = jsdocConfig.opts || {};
		jsdocConfig.opts.destination = documentationDirectory;

		gulp.src(jsBlob, { read: false }).
			pipe(
				jsdoc(jsdocConfig, function(err) {
					if (err) {
						deferred.reject(err);
						return;
					}

					deferred.resolve();
				})
			);
	});

	return deferred.promise;
}

function _setupDocumentationSymlinks() {
	const deferred = Q.defer();

	fs.readdir(
		currentVersionDocumentationDirectory,
		{
			encoding: "utf8"
		},
		function(err, files) {
			if (err) {
				deferred.reject(err);
				return;
			}

			let errored = false;

			_.each(
				files,
				function(file) {
					try {
						let symlinkedFile = path.join(documentationDirectory, file);

						try {
							fs.unlinkSync(symlinkedFile);
						}
						catch(e) {}
						
						fs.symlinkSync(
							path.relative(
								documentationDirectory,
								path.join(currentVersionDocumentationDirectory, file)
							),
							symlinkedFile
						);
					}
					catch(e) {
						deferred.reject(e);
						errored = true;
						return false;
					}
				}
			);

			if (!errored) {
				deferred.resolve();
			}
		}
	);

	return deferred.promise;
}

/**
 * This function generates the partials.js file which is included by the Handlebars client-side
 * init function and read by browserify into a map of partial name to function. Without this,
 * any templates used client-side will not be able to use any partials.
 *
 * @returns Promise that resolves when the file has been written, or rejects if any error occurred
 * in generating it.
 */
function _writePartialsFile() {
	var deferred = Q.defer();

	dirRecurse(partialsDirectory, function(err, files) {
		if (err) {
			deferred.reject(new Error('Error generating Handlebars partials file: ' + err));
		}

		var partialsFileText = "/* jshint node:true */\n" +
			"/* This file is autogenerated by Gulp; do not make changes to this file */\n" +
			"module.exports = {\n" + _.reduce(
			files,
			function(str, file) {
				if (!hbsSuffixRegex.test(file)) {
					return str;
				}

				var partialName = path.relative(partialsDirectory, file).replace(hbsSuffixRegex, '');

				var partialPath = path.relative(jsDirectory, file);

				if (str) {
					str += ",\n";
				}

				str += "\t" + JSON.stringify(partialName) + ": require(" + JSON.stringify(partialPath) + ")";

				return str;
			},
			""
		) + "\n};";

		return Q.nfcall(
			fs.writeFile,
			partialsFile,
			partialsFileText,
			{
				encoding: "utf8"
			}
		).then(
			function() {
				deferred.resolve();
			},
			function(err) {
				deferred.reject(err);
			}
		);
	});

	return deferred.promise;
}

function _writeViewMapFile() {
	gutil.log('Writing view map file');
	var deferred = Q.defer();

	// Make a name a valid JS identifier:
	//	- camelCase it
	//	- prepend an underscore in case the name starts with a character that
	//	  is not valid at the beginning of an identifier, such as a number
	function _viewIdentifier(viewName) {
		return '_' + _.camelCase(viewName);
	}

	dirRecurse(jsViewsDirectory, function(err, files) {
		if (err) {
			deferred.reject(new Error('Error generating view map file: ' + err));
		}

		var views = _.reduce(
			files,
			function(obj, file) {
				if (!es6SuffixRegex.test(file)) {
					return obj;
				}

				var viewName = path.relative(jsViewsDirectory, file).replace(es6SuffixRegex, '');

				var viewPath = path.relative(jsDirectory, file);

				// Node path resolution expects any relative paths to start with "." or ".."
				if (viewPath[0] !== '.') {
					viewPath = './' + viewPath;
				}

				obj[viewName] = viewPath;

				return obj;
			},
			{}
		);

		var viewMapFileText = "/* This file is autogenerated by Gulp; do not make changes to this file */\n" +
			_.reduce(
				views,
				function(str, path, name) {
					if (str) {
						str += "\n";
					}

					str += "import " + _viewIdentifier(name) + " from " + JSON.stringify(path) + ";";

					return str;
				},
				""
			) + "\n\nexport default {" +
			_.reduce(
				views,
				function(str, path, name) {
					if (str) {
						str += ",";
					}

					str += "\n\t" + JSON.stringify(name) + ": " + _viewIdentifier(name);

					return str;
				},
				""
			) + '\n};';

		return Q.nfcall(
			fs.writeFile,
			viewMapFile,
			viewMapFileText,
			{
				encoding: "utf8"
			}
		).then(
			function() {
				deferred.resolve();
			},
			function(err) {
				deferred.reject(err);
			}
		);
	});

	return deferred.promise;
}

function _changeEventToOperation(eventType) {
	var operation;

	switch(eventType) {
		case 'add': 
			operation = 'addition of';
			break;
		case 'unlink':
			operation = 'deletion of';
			break;
		case 'change':
			operation = 'changes to';
			break;
	}

	return operation;
}

function _getLintStream(files) {
	return gulp.src(_.size(files) > 0 ? files : [jsBlob])
		.pipe(jshint())
		.pipe(jshint.reporter(stylish));
}

function _compileScripts(bundler, changedFiles) {
	if (_.size(changedFiles) > 0) {
		// Ignore autogenerated files (to avoid infinite recompilation loops)
		changedFiles = _.without(changedFiles, viewMapFile, partialsFile);

		if (_.size(changedFiles) === 0) {
			return;
		}
	}

	return _writeViewMapFile().done(
		function() {
			if (_.size(changedFiles) > 0) {
				gutil.log('Recompiling scripts due to changes in the following files:\n\t' + 
					_.map(
						changedFiles,
						function(file) {
							return path.relative(__dirname, file);
						}
					)
				);
			}

			changedFiles = _.filter(
				changedFiles,
				function(file) {
					// Don't lint template files
					return !hbsSuffixRegex.test(file) &&
						// Or autogenerated files
						file !== partialsFile &&
						file !== viewMapFile;
				}
			);

			var compileStream = bundler
				.bundle()
				.on('error', function(err) {
					gutil.log(gutil.colors.red('Browserify Error\n'), err.message, err.stack || '');
				})
				.on('log', gutil.log)
				.pipe(source('build.js'))
				.pipe(buffer())
				.pipe(sourcemaps.init({
					loadMaps: true // loads map from browserify file
				}))
				// .pipe(gulpIf(!IS_DEVELOPMENT, uglify()))
				// .on('error', function(err) {
				// 	gutil.log(gutil.colors.red('Uglify error:\n'), err.toString());
				// })
				.pipe(sourcemaps.write('.')) // writes .map file
				.pipe(gulp.dest(path.join(config.paths.static, 'dist', 'js/')));

			// Don't bother linting in prod environment--errors will only be fixed in dev anyway
			if (IS_DEVELOPMENT) {
				return merge(
					_getLintStream(changedFiles),
					compileStream
				);
			}

			return compileStream;
		}
	);
}

function _scriptsTask(watch) {
	var bundler = browserify([path.join(jsDirectory, 'main.es6')].concat(thirdPartyJS), browserifyOptions);
	
	if (watch) {
		bundler = watchify(bundler);
	}

	bundler.transform(hbsfy.configure(hbsfyOptions));
	
	bundler.transform(babelify.configure(babelifyOptions));

	if (!IS_DEVELOPMENT) {
		bundler.transform(uglifyifyOptions, 'uglifyify');
	}

	if (watch) {
		bundler.on('update', _.bind(_compileScripts, undefined, bundler));
	}

	return _compileScripts(bundler);
}

gulp.task('scripts', function() {
	return _scriptsTask();
});

gulp.task('watch-scripts', function() {
	return _scriptsTask(true);
});

gulp.task('write-partials', function() {
	return _writePartialsFile();
});

gulp.task('watch-partials', function() {
	gulp.watch(partialsBlob, ['write-partials']);
});

gulp.task('lint', function() {
	return _getLintStream();
});

gulp.task('copy-fonts', function() {
	var fontOutPath = path.join(config.paths.static, 'dist', 'fonts');

	gulp.src(
		path.join(config.paths.static, 'node_modules', 'font-awesome', 'fonts', '**')
	).pipe(changed(fontOutPath))
	.pipe(gulp.dest(fontOutPath));
});

gulp.task('styles', ['copy-fonts'], function() {
	return gulp.src(path.join(stylesDirectory, 'main.less'))
		.pipe(gulpDebug())
		.pipe(
			plumber(
				function(err) {
					gutil.log(gutil.colors.red('LESS error:\n'), err.message, err.stack || '');
				}
			)
		)
		.pipe(sourcemaps.init())
		.pipe(less({
			modifyVars: {
				"@fa-font-path": '"../fonts"'
			},
			plugins: [cleancss, autoprefix]
		}))
		.pipe(rename({
			dirname: '',
			basename: 'build',
			extname: '.css'
		}))
		.pipe(sourcemaps.write())
		.pipe(gulp.dest(path.join(config.paths.static, 'dist', 'css/')));
});

gulp.task('watch-styles', ['styles'], function() {
	return watch(path.join(stylesDirectory, '**/*.less'), function(changedFile) {
		gutil.log(
			'Recompiling styles due to ' + _changeEventToOperation(changedFile.event) +
				' the following file: \n\t' +
				path.relative(stylesDirectory, changedFile.path)
		);

		gulp.start('styles');
	});
});

gulp.task('scripts-and-templates', function() {
	return runSequence(
		'write-partials',
		'scripts'
	);
});

gulp.task('static', ['styles', 'scripts-and-templates']);

gulp.task('watch-static', ['watch-styles', 'watch-partials', 'watch-scripts']);

gulp.task('build', ['static', 'generate-favicon']);

gulp.task('docs', function(done) {
	_cleanDocumentation().then(_buildDocumentation).
		then(_setupDocumentationSymlinks).done(
			() => done(),
			(err) => done(err)
		);
});


// File where the favicon markups are stored
const FAVICON_DATA_FILE = path.join(faviconDirectory, 'faviconData.json');

// Generate the icons. This task takes a few seconds to complete.
// You should run it at least once to create the icons. Then,
// you should run it whenever RealFaviconGenerator updates its
// package (see the check-for-favicon-update task below).
gulp.task('generate-favicon', function(done) {
	realFavicon.generateFavicon({
		masterPicture: path.join(__dirname, 'favicon-master.png'),
		dest: faviconDirectory,
		iconsPath: '/',
		design: {
			ios: {
				pictureAspect: 'backgroundAndMargin',
				backgroundColor: '#ffffff',
				margin: '21%',
				assets: {
					ios6AndPriorIcons: false,
					ios7AndLaterIcons: false,
					precomposedIcons: false,
					declareOnlyDefaultIcon: true
				}
			},
			desktopBrowser: {},
			windows: {
				pictureAspect: 'noChange',
				backgroundColor: '#da532c',
				onConflict: 'override',
				assets: {
					windows80Ie10Tile: false,
					windows10Ie11EdgeTiles: {
						small: false,
						medium: true,
						big: false,
						rectangle: false
					}
				}
			},
			androidChrome: {
				pictureAspect: 'backgroundAndMargin',
				margin: '17%',
				backgroundColor: '#ffffff',
				themeColor: '#ffffff',
				manifest: {
					name: 'XWords',
					display: 'standalone',
					orientation: 'notSet',
					onConflict: 'override',
					declared: true
				},
				assets: {
					legacyIcon: false,
					lowResolutionIcons: false
				}
			},
			safariPinnedTab: {
				pictureAspect: 'blackAndWhite',
				threshold: 90,
				themeColor: '#5bbad5'
			}
		},
		settings: {
			compression: 2,
			scalingAlgorithm: 'Mitchell',
			errorOnImageTooSmall: false
		},
		markupFile: FAVICON_DATA_FILE
	}, function() {
		done();
	});
});

// Inject the favicon markups in your HTML pages. You should run
// this task whenever you modify a page. You can keep this task
// as is or refactor your existing HTML pipeline.
gulp.task('inject-favicon-markups', function() {
	gulp.src([path.join(config.paths.templates, 'layout.hbs')])
		.pipe(realFavicon.injectFaviconMarkups(JSON.parse(fs.readFileSync(FAVICON_DATA_FILE)).favicon.html_code))
		.pipe(gulp.dest(config.paths.templates));
});

// Check for updates on RealFaviconGenerator (think: Apple has just
// released a new Touch icon along with the latest version of iOS).
// Run this task from time to time. Ideally, make it part of your
// continuous integration system.
gulp.task('check-for-favicon-update', function(done) {
	var currentVersion = JSON.parse(fs.readFileSync(FAVICON_DATA_FILE)).version;
	realFavicon.checkForUpdates(currentVersion, function(err) {
		if (err) {
			throw err;
		}
	});
});
