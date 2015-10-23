var
    fs = require('fs'),
    path = require('path'),
    gulp = require('gulp'),

    $ = require('gulp-load-plugins')({ rename: { 'gulp-cond': 'conditional' } });

$.glob  = require('glob');
$.merge = require('merge-stream');

$.helpers = {
    isComponentDirectory: function(dirname) {
        return (
            (dirname.indexOf('my-') > -1)
        );
    }
};

var watching = false;

// Fixes the paths and copies html files to dist.
gulp.task('html', function () {
    return gulp.src('./my-*/*.html')
        .pipe($.replace(/\.\.\/(?!my)/gmi, '../../'))
        .pipe(gulp.dest('./dist/'));
});

// Copies assets
gulp.task('assets', function () {
    return gulp.src('./my-*/*.{css,ttf,woff,eot,svg,jpeg,jpg,png}')
        .pipe(gulp.dest('./dist/'));
});

// Cleans the dist dir
gulp.task('clean', function () {
    return gulp.src('./dist/*', {read: false})
        .pipe($.clean());
});

gulp.task('dev', $.sequence('clean', ['assets', 'html']));

gulp.task('default', ['dev']);

gulp.task('build', ['dev'], function () {
});

// Runs the webserver that will server the demo page on localhost
gulp.task('serve', ['build'], function () {
    gulp.src('.')
        .pipe($.webserver({
            host: 'localhost',
            open: true,
            port: 5050
        }));
});


/**
 * Watch tasks.
 */
gulp.task('watch', function () {
    watching = true;
    $.util.log($.util.colors.red('Warning'), 'adding/removing files might not be handled by those watch tasks (especially on Windows). Do a gulp dev in another console just to be sure.');
    gulp.watch('./*/*.html', [
        'html'
    ]);
    gulp.watch('./*/*.{ttf,woff,eot,svg,jpeg,jpg,png,css}', ['assets']);
});
