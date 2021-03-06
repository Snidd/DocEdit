(function () {
    "use strict";

    var http = require('http'),
        fs = require('fs'),
        projectBasePath = __dirname + '/../..';

    function getLatestCoverageObject() {
        var coverageDir = projectBasePath + '/build/reports/coverage';

        if (!fs.existsSync(coverageDir)) {
            return;
        }

        var files = fs.readdirSync(coverageDir);
        if (files.length === 0) {
            return;
        }
        var newestTime = 0, newestFile;
        for (var i = 0; i < files.length; i += 1) {
            if (files[i].indexOf('coverage') !== -1) {
                var stat = fs.statSync(coverageDir + '/' + files[i]);
                if (newestTime < stat.ctime.getTime()) {
                    newestTime = stat.ctime.getTime();
                    newestFile = files[i];
                }
            }
        }
        return fs.readFileSync(coverageDir + '/' + newestFile).toString();
    }

    function postJson(host, port, path, data, done) {

        if (!data) {
            return;
        }

        var find = './app';
        var re = new RegExp(find, 'g');
        data = data.replace(re, projectBasePath.substring(0, projectBasePath.indexOf('/test/rtd')) + '/app');

        var options = {
            hostname: host,
            port: port,
            path: path,
            method: 'POST',
            headers: {
                'Content-type': 'application/json'
            }
        };

        var req = http.request(options, function (res) {
            res.setEncoding('utf8');
            res.on('data', function () {
                done();
            });
        });

        req.on('error', function (e) {
            console.log('Error submitting coverage: ' + e.message);
            console.log(e.stack);
            done();
        });

        req.write(data);
        req.end();
    }

    function getRunCmd(grunt) {
        var runCmd = fs.existsSync(projectBasePath + '/app/smart.json') ? 'mrt' : 'meteor run',
            settingsPath = getSettingsPath(grunt);

        if (settingsPath) {
            runCmd += ' --settings ' + settingsPath;
        }
        console.log('resolved meteor run command to [' + runCmd + ']');
        return runCmd;
    }

    /**
     * Returns the path to a Meteor.settings file, if applicable.
     * If settings file is not found, returns null.
     *
     * Default is to check for 'settings.json' in the 'app' folder.
     *
     * The settings path can be passed via command line, like so:
     * > grunt --settingsPath '~/project/settings.json'
     *   note: if path is not absolute, path should be relative to
     *         the directory where grunt is executed.
     *
     * @method getSettingsPath
     * @param {Object} grunt
     * @return {String|Null} path to a settings file, for use when
     *                       executing 'meteor run --settings ...'
     */
    function getSettingsPath(grunt) {
        var settingsPath,
            viaOption,
            fileExists,
            relativeToProjectBase;

        viaOption = grunt.option('settingsPath');
        settingsPath = viaOption || (projectBasePath + '/app/settings.json');
        fileExists = fs.existsSync(settingsPath);

        if (viaOption && !fileExists) {
            grunt.fatal("Settings file '" + viaOption + "' not found.  " +
                "Note: Path must be relative to the current directory.");
        }
        if (!fileExists) {
            return null;
        }

        relativeToProjectBase = (0 === settingsPath.indexOf(projectBasePath));
        if (relativeToProjectBase) {

            // ex. ../../app/settings.json
            settingsPath = settingsPath.substring(projectBasePath.length);

            if (0 === settingsPath.indexOf('/app/')) {
                // strip left-over relative part
                settingsPath = settingsPath.substring(5);
            }

        }
        return settingsPath;
    }

    module.exports = function (grunt) {

        var runCmd = getRunCmd(grunt);

        grunt.initConfig({
            basePath: projectBasePath,
            chromeDriverOs: 'mac32', // You can also do linux_64
            chromeDriverVersion: '0.8',
            chromeDriverSha: '5a485bb73a7e85a063cffaab9314837a00b98673',
            seleniumServeVersion: '2.32.0',
            seleniumServeSha: 'c94e6d5392b687d3a141a35f5a489f50f01bef6a',
            watch: {
                files: [
                    '<%= basePath %>/test/unit/**/*',
                    '<%= basePath %>/test/acceptance/**/*.js',
                    '<%= basePath %>/app/**/*',
                    '!<%= basePath %>/app/.meteor/local/**/*'
                ],
                tasks: [
                    'bgShell:karmaRun',
                    'bgShell:synchronizeMirrorApp',
                    'bgShell:instrumentCode',
                    'bgShell:runTests',
                    'postLatestUnitCoverage',
                    'bgShell:killReports',
                    'bgShell:runCoverageCheck'
                ]
            },
            bgShell: {
                _defaults: {
                    bg: true,
                    stdout: true,
                    stderr: true,
                    fail: true
                },
                startGhostDriver: {
                    cmd: 'phantomjs --webdriver=4444 > /dev/null 2>&1;'
                },
                startKarma: {
                    cmd: 'cd <%= basePath %>/test/rtd;' +
                        'karma start;'
                },
                instrumentCode: {
                    cmd: 'istanbul instrument <%= basePath %>/app -o <%= basePath %>/test/rtd/mirror_app -x "**/packages/**" -x "**/3rd/**";',
                    bg: false
                },
                killAll: {
                    cmd: "kill `ps -ef|grep -i meteor   | grep -v grep| awk '{print $2}'` > /dev/null 2>&1;" +
                        "kill `ps -ef|grep -i mrt      | grep -v grep| awk '{print $2}'` > /dev/null 2>&1;" +
                        "kill `ps -ef|grep -i mongod   | grep -v grep| awk '{print $2}'` > /dev/null 2>&1;" +
                        "kill `ps -ef|grep -i selenium | grep -v grep| awk '{print $2}'` > /dev/null 2>&1;" +
                        "kill `ps -ef|grep -i karma    | grep -v grep| awk '{print $2}'` > /dev/null 2>&1;" +
                        "kill `ps -ef|grep -i phantomjs| grep -v grep| awk '{print $2}'` > /dev/null 2>&1;" +
                        "rm <%= basePath %>/build/reports/coverage/*.json;",
                    fail: false,
                    bg: false,
                    stdout: false,
                    stderr: false
                },
                killReports: {
                    cmd: "rm <%= basePath %>/build/reports/coverage/*.json;",
                    fail: false,
                    bg: false,
                    stdout: true,
                    stderr: true
                },
                startApp: {
                    cmd: 'cd <%= basePath %>/app;' +
                        runCmd + ' --port 3000;'
                },
                startMirrorApp: {
                    cmd: 'cd <%= basePath %>/test/rtd/mirror_app;' +
                        runCmd + ' --port 8000;'
                },
                synchronizeMirrorApp: {
                    cmd: 'rsync -av --delete -q --delay-updates --force --exclude=".meteor/local" <%= basePath %>/app/ mirror_app;' +
                        'echo >> mirror_app/.meteor/packages; echo http >> mirror_app/.meteor/packages;' +
                        'mkdir -p mirror_app/packages;' +
                        'cd mirror_app/packages;' +
                        'ln -s ../../lib/istanbul-middleware-port .;' +
                        'cd ../..;' +
                        'cp ../acceptance/fixtures/* mirror_app/server;',
                    bg: false
                },
                runTests: {
                    cmd: 'export NODE_PATH="$(pwd)/node_modules";' +
                        'jasmine-node <%= basePath %>/test/acceptance/;',
                    bg: false,
                    fail: true
                },
                runCoverageCheck: {
                    cmd: 'export NODE_PATH="$(pwd)/node_modules";' +
                        'jasmine-node <%= basePath %>/test/rtd/lib;',
                    bg: false,
                    fail: true
                },
                touchMirrorApp: {
                    cmd: 'touch mirror_app/.meteor/packages;',
                    bg: false,
                    fail: false
                },
                karmaRun: {
                    cmd: 'karma run',
                    bg: false,
                    fail: false
                }
            },
            'unzip': {
                chromeDriver: {
                    src: '<%= basePath %>/test/rtd/lib/bin/chromedriver2_<%= chromeDriverOs %>_<%= chromeDriverVersion %>.zip',
                    dest: '<%= basePath %>/test/rtd/lib/bin/'
                }
            }
        });
        grunt.loadNpmTasks('grunt-bg-shell');
        grunt.loadNpmTasks('grunt-contrib-watch');
        grunt.loadNpmTasks('grunt-zip');

        grunt.registerTask('chmod', 'chmod', function () {
            fs.chmodSync(projectBasePath + '/test/rtd/lib/bin/chromedriver', '755');
        });

        grunt.registerTask('postLatestUnitCoverage', 'postLatestUnitCoverage', function () {
            var done = this.async();
            postJson('localhost', 8000, '/coverage/client', getLatestCoverageObject(), done);
        });

        grunt.registerTask('downloadAndOrStartSelenium', 'downloadAndOrStartSelenium', function () {
            var done = this.async();
            require(projectBasePath + '/test/rtd/lib/selenium-launcher.js')(function (er, selenium) {
                console.log('selenium-server started on ' + selenium.host + ':' + selenium.port);
                if (!fs.existsSync(projectBasePath + '/test/rtd/lib/bin/chromedriver')) {
                    grunt.task.run('unzip', 'chmod');
                }
                done();
            }, {
                chromeDriverOs: grunt.config.get('chromeDriverOs'),
                chromeDriverVersion: grunt.config.get('chromeDriverVersion'),
                chromeDriverSha: grunt.config.get('chromeDriverSha'),
                seleniumServerVersion: grunt.config.get('seleniumServeVersion'),
                seleniumServerSha: grunt.config.get('seleniumServeSha')
            });
        });

        grunt.registerTask('default', [
            'bgShell:killAll',
            'downloadAndOrStartSelenium',
            'bgShell:synchronizeMirrorApp',
            'bgShell:instrumentCode',
            'bgShell:startMirrorApp',
            'bgShell:startKarma',
            'bgShell:startApp',
            'watch'
        ]);
    };

})();
