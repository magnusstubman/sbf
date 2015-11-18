var express = require('express');
var app = express();
var radamsa = require('node-radamsa');
var program = require('commander');
var fs = require('fs');
var hogan = require('hogan.js');
var path = require('path');
var timestamp = require('monotonic-timestamp');
var log = require('single-line-log').stdout;

program.version('0.0.1');
program.usage(' -i in/ -o out/')
program.option('-i, --input [dir]', 'mandatory input directory of testcases');
program.option('-o, --output [dir]', 'mandatory output directory');
program.option('-p, --port [portnumber]', 'optional port for webserver to listen on - default is 7000', '7000');
program.option('-t, --template [file]', 'optional template file to use - default is template.mustache', 'template.mustache');
program.option('-T, --timeout [milliseconds]', 'optional milliseconds to wait before writing last response to output directory - default is 2000', '2000');
program.parse(process.argv);

var isDir = function (path) {
    try {
        return fs.lstatSync(path).isDirectory();
    } catch (e) {
        return false;
    }
};

var isDirEmpty = function (path) {
    return filesInDir(path).length === 0;
};

var filesInDir = function (path) {
    try {
        return fs.readdirSync(path);
    } catch (e) {
        throw 'Could not check contents of ' + path;
    }
};

var getRandomTestcase = function () {
    var testcases = filesInDir(program.input);
    var randomNumber = Math.floor((Math.random() * testcases.length) + 1);
    var chosenTestcase = testcases[randomNumber - 1];
    var testcasePath = path.join(program.input, chosenTestcase);
    return radamsa.run(testcasePath);
};

if (!((isDir(program.input) && !isDirEmpty(program.input)) && isDir(program.output))) {
    console.log('input and output directories must be specified! Try --help');
    console.log('input directory must contain testcases to fuzz');
    process.exit(1);
}

var template;
try {
    template = hogan.compile(fs.readFileSync(program.template, 'utf8'));
} catch (e) {
    console.log('Compiling template file failed: ' + program.template);
    process.exit(1);
}

var generateOutput = function (req) {
  var requestUrl = req.protocol + '://' + req.get('Host') + req.url;
  var testcase = getRandomTestcase();

  var options = {
       testcase: testcase,
       serverAddress: requestUrl
  };

  return template.render(options);
};

var clientStoppedRequesting = function (count, output) {
    console.log('Client stopped requesting after ' + count + ' requests');
    var outputFileName = timestamp() + '.html'
    var outputFilePath = path.join(program.output, outputFileName);
    console.log('Writing last response to ' + outputFilePath);
    fs.writeFileSync(outputFilePath, output, 'utf8');
};

var count = 0;
var killhandle;

app.get('/', function (req, res) {
  var requestedUrl = req.protocol + '://' + req.get('Host') + req.url;
  var output = generateOutput(req);
  res.send(output);
  count++;

  clearTimeout(killhandle);
  killhandle = setTimeout(function () {
       clientStoppedRequesting(count, output);
  }, program.timeout);

  log(count + ' responses sent');
});

var server = app.listen(program.port, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Listening at http://%s:%s', host, port);
});
