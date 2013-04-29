var assert = require('assert');
var http = require('http');

var staticroute = require('../');

var host = 'localhost';
var port = 9128;

var server = http.createServer(staticroute());
server.listen(port, host, started);

function started() {
  console.log('server started');

  http.request('http://localhost:9128/', function(res) {
    console.log('GET /');
    console.log('-> statusCode = %d', res.statusCode);
    console.dir(res.headers);
    assert(res.statusCode === 403);
    process.exit(0);
  }).end();
}
