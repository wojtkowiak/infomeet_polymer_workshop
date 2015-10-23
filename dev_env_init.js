var fs = require('fs');
var os = require('os');
var exec = require('child_process').execSync;
var path = require('path');

var templatePath = 'template/';

function toCamelCase(string) {
    var array = string.split('');
    for (var i = array.length - 1; i > 0; i--) {
        if ((array[i] == '-' || array[i] == '_') && i < (array.length - 1)) {
            array.splice(i, 1);
            array[i] = array[i].toUpperCase();
        }
    }
    array[0] = array[0].toUpperCase();
    return array.join('');
}

// synchronously executes a command
function call(command, isResult) {
    try {
        var result = exec(command);
        if (isResult) {
            console.log(new Buffer(result).toString('UTF-8'));
        }
        return true;
    } catch (e) {
        console.log('Error script: ' + command);
        return false;
    }
}

function install() {
    console.log('Installation is starting...');

    if (!call('node -v') || !call('npm -v')) {
        console.log('NodeJS and NPM is required');
        process.exit(1);
    }

    call('npm install', true);
    call('bower install', true);

    console.log('Hopefully all went alright and you can start developing...');
}

function printHelp() {
    console.log('Use params:');
    console.log('');
    console.log('   -i --install - prepares the development environment');
}


install();
