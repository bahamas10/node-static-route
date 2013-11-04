/**
 * create a static route
 */
var fs = require('fs');
var path = require('path');
var url = require('url');

var mime = require('mime');

module.exports = main;

// end `res` with statusCode = `code`
function end(res, code) {
  res.statusCode = code;
  res.end();
}

// exported function to give a static route function
function main(opts) {
  opts = opts || {};
  if (typeof opts === 'string') {
    opts = { dir: opts };
  }
  opts.tryfiles = [''].concat((opts.tryfiles || []).reverse());

  var logger = opts.logger || console.error.bind(console);

  return staticroute;

  // static serving function
  function staticroute(req, res) {
    var tryfiles = opts.tryfiles.slice(0);

    // `npm install easyreq` to have req.urlparsed set
    var urlparsed = req.urlparsed || url.parse(req.url, true);

    // decode everything, and then fight against dir traversal
    var pathname = urlparsed.pathname;
    if (opts.slice && pathname.indexOf(opts.slice) === 0)
      pathname = pathname.substr(opts.slice.length);
    var reqfile = path.normalize(decodeURIComponent(pathname));

    // unsupported methods
    if (['HEAD', 'GET'].indexOf(req.method) === -1)
      return end(res, 501);

    var f = path.join((opts.dir || process.cwd()), reqfile);
    tryfile();

    function tryfile() {
      var file = path.join(f, tryfiles.pop());
      // the user wants some actual data
      fs.stat(file, function(err, stats) {
        if (err) {
          logger(err.message);
          if (tryfiles.length) return tryfile();

          end(res, err.code === 'ENOENT' ? 404 : 500);
          return;
        }

        if (stats.isDirectory()) {
          // directory
          // forbidden
          if (!opts.autoindex) return end(res, 403);

          // json stringify the dir
          statall(file, function(e, files) {
            if (e) {
              logger(e.message);
              end(res, 500);
              return;
            }
            files = files.map(function(_file) {
              return _file.filename + (_file.directory ? '/' : '');
            });
            files.sort(function(a, b) {
              a = a.toLowerCase();
              b = b.toLowerCase();
              var adir = a.indexOf('/') > -1;
              var bdir = b.indexOf('/') > -1;
              if (adir && !bdir)
                return -1;
              else if (bdir && !adir)
                return 1;
              return a < b ? -1 : 1;
            });
            if (urlparsed.query.hasOwnProperty('json')) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.write(JSON.stringify(files));
            } else {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.write('<ul style="list-style: none; font-family: monospace;">\n');
              files.forEach(function(_file) {
                var linktext = _file;
                var linkhref = path.join(urlparsed.pathname, _file);
                res.write('<li>' + linktext.link(linkhref) + '</li>\n');
              });
              res.write('</ul>\n');
              res.write('<hr />\n');
            }
            res.end();
          });
        } else {
          // file
          var etag = '"' + stats.size + '-' + stats.mtime.getTime() + '"';
          res.setHeader('Last-Modified', stats.mtime.toUTCString());

          // check cache and range
          var range = req.headers.range;
          if (req.headers['if-none-match'] === etag) {
            end(res, 304);
          } else if (range) {
            var parts = range.replace(/bytes=/, '').split('-');
            var partialstart = parts[0];
            var partialend = parts[1];

            var startrange = parseInt(partialstart, 10);
            var endrange = partialend ? parseInt(partialend, 10) : stats.size - 1;
            if (!startrange)
              startrange = 0;
            if (!endrange)
              endrange = stats.size - 1;
            var chunksize = endrange - startrange + 1;

            res.statusCode = 206;
            res.setHeader('Content-Range', 'bytes ' + startrange + '-' + endrange + '/' + stats.size);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunksize);
            res.setHeader('Content-Type', mime.lookup(file));
            res.setHeader('ETag', etag);
            if (req.method === 'HEAD') {
              res.end();
            } else {
              var rs = fs.createReadStream(file, {start: startrange, end: endrange});
              rs.pipe(res);
              res.on('close', rs.destroy.bind(rs));
            }
          } else {
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Content-Type', mime.lookup(file));
            res.setHeader('ETag', etag);
            if (req.method === 'HEAD') {
              res.end();
            } else {
              var rs = fs.createReadStream(file);
              rs.pipe(res);
              res.on('close', rs.destroy.bind(rs));
            }
          }
        }
      });
    }
  }
}

function statall(dir, cb) {
  var files = [];
  fs.readdir(dir, function(err, d) {
    if (err) {
      cb(err);
      return;
    }
    d = ['..'].concat(d);

    var i = 0;
    d.forEach(function(file) {
      fs.stat(path.join(dir, file), function(_err, stats) {
        i++;
        if (!_err) {
          stats.filename = file;
          stats.directory = stats.isDirectory();
          files.push(stats);
        }
        if (i === d.length)
          cb(null, files);
      });
    });
  });
}
