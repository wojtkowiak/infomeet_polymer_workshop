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

gulp.task('extractJS', function () {
    return gulp.src('./my-*/*.html')
        .pipe($.crisper())
        .pipe(gulp.dest('./dist/'));
});

// Wraps the stream, so we can end it while in 'watch' task
function wrap(stream) {
    stream.on('error', function (error) {
        $.util.log($.util.colors.red(error.message));
        $.util.log(error.stack);
        if (watching) {
            $.util.log($.util.colors.yellow('[aborting]'));
            stream.end();
        } else {
            $.util.log($.util.colors.yellow('[exiting]'));
            console.log('rrr');
            process.exit(1);
        }
    });
    return stream;
}

gulp.task('transpileJS', ['extractJS'], function () {
    var dirs = fs.readdirSync('./dist/'), streams = $.merge(), es2015File;
    for (var i = 0; i < dirs.length; i++) {
        var files = fs.readdirSync('./dist/' + dirs[i]);
        for (var k = 0; k < files.length; k++) {
            if (files[k].indexOf('.js') != -1 && files[k].indexOf('.js') === files[k].length - 3) {
                es2015File = fs.readFileSync('./' + dirs[i] + '/' + files[k].replace('.js', '.html'), 'utf8').indexOf('text/ecmascript-6') > -1;
                if (es2015File) {
                    streams.add(
                        gulp.src('./dist/' + dirs[i] + '/' + files[k])
                            .pipe($.sourcemaps.init())
                            .pipe(wrap($.babel({})))
                            .pipe($.sourcemaps.write(''))
                            .pipe(gulp.dest('./dist/' + dirs[i] + '/'))
                    );
                }
            }
        }
    }
    return streams;
});

// Fixes the paths and copies html files to dist.
gulp.task('html', ['transpileJS'], function () {
    return gulp.src('./dist/my-*/*.html')
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
