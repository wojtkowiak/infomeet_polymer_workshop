module.exports = function(gulp, $, fs) {

    var classParser = require('./PolymerES2015ClassParser.js');
    var path = require('path');
    var _ = require('lodash');

    // Cleans the dist dir
    gulp.task('demo:clean', function () {
        return gulp.src('./demo/*', {read: false})
            .pipe($.clean());
    });

    // Copies components to demo dir
    gulp.task('demo:copy', function () {
        return gulp.src('./my-*/**/*')
            .pipe(gulp.dest('./demo/'));
    });

    // Fixes url in demo dir
    gulp.task('demo:fix-url', function () {
        return $.merge(
            gulp
                .src('./demo/my-*/*.html')
                .pipe($.replace(/\.\.\/(?!\.)/gmi, '../../'))
                .pipe(gulp.dest('./demo/')),
            gulp
                .src('./demo/my-*/demo/*.html')
                .pipe($.replace(/\.\.\/\.\.\/(?!\.)/gmi, '../../../'))
                .pipe(gulp.dest('./demo/'))
        );
    });

    // Recreates a ES5 object structure from ES2015 class so that iron-component-page will work
    function createPolymerStub(file, filePath) {
        try {
            var polymerClass = new classParser(file);
        } catch (e) {
            $.util.log($.util.colors.red('[JAVASCRIPT]'), 'error trying to create a ES5 stub from ES2015 class: ' + e + '\n' + filePath);
            return false;
        }

        var script = '';
        if (polymerClass.isBehavior) {
            script += "/* \n" + polymerClass.firstComment + " \n*/";
        }

        script += "window." + polymerClass.className;

        script += " = " + ((!polymerClass.isBehavior) ? "Polymer(" : "") + "{ \n" +
            ((!polymerClass.isBehavior) ? "is: \"" + polymerClass.is + "\"," : "");

        if (polymerClass.properties.length > 0) {
            script += "properties: { ";
            // Recreating properties
            _.forEach(polymerClass.properties, function (property) {
                script += ((property.comment) ? '/* ' + property.comment + ' */ ' : '') + "\n" + property.code + ',';
            });
            script = script.substring(0, script.length - 1) + '}, ';
        }

        if (polymerClass.behaviors && polymerClass.behaviors.length > 0) {
            script += '\nbehaviors: [';
            for (var i = 0; i < polymerClass.behaviors.length; i++) {
                script += polymerClass.behaviors[i] + ', ';
            }
            script = script.substring(0, script.length - 2) + '], ';
        }

        // Recreating methods
        _.forEach(polymerClass.methods, function (method) {
            script += ((method.comment) ? '/* ' + method.comment + ' */ ' : '') + "\n" + method.name + ": function(" + method.declaration + ") {}, ";
        });
        script = script.substring(0, script.length - 2);

        // Adding comments with events
        _.forEach(polymerClass.events, function (event) {
            script += '/* ' + event + ' */ ';
        });

        script += "}" + ((!polymerClass.isBehavior) ? ")" : "") + ";";

        return script;
    }

// Replaces ES2015 classes with ES5 stubs so that the iron-component-page on demo will work
    gulp.task('demo:fix-es2015', function () {
        var stub = '';
        return gulp
            .src("./demo/my-*/!(index).html")
            .pipe($.cheerio(function ($, file) {
                var i = 1;
                // We will iterate over every script that is ES2015
                $('script').each(function () {
                    if ($(this).attr('type') === "text/ecmascript-6") {
                        stub = createPolymerStub($(this).text(), file.path);
                        // Replace it with ES5 stub
                        if (stub !== false) {
                            $(this).html(stub);
                        }
                        $(this).attr('type', null);
                    }
                });
            }))
            .pipe(gulp.dest('./demo/'));
    });

    gulp.task('demo:prepare', $.sequence('dev', 'demo:clean', 'demo:copy', 'demo:fix-url', 'demo:fix-es2015'));

    // Runs the webserver that will server the demo page
    gulp.task('demo', [
        'demo:prepare'
    ], function () {
        gulp.src('.')
            .pipe($.webserver({
                host: 'localhost',
                open: true,
                port: 5050
            }));
    });




};