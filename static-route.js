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
  var logger = opts.logger || console.error.bind(console);

  return staticroute;

  // static serving function
  function staticroute(req, res) {
    // `npm install easyreq` to have this variable set
    var urlparsed = req.urlparsed || url.parse(req.url, true);

    // decode everything, substitute # but not /
    var reqfile = path.normalize(decodeURI(urlparsed.pathname).replace(/%23/g, '#'));

    // unsupported methods
    if (['HEAD', 'GET'].indexOf(req.method) === -1)
      return end(res, 501);

    var file = path.join((opts.dir || process.cwd()), reqfile);

    // the user wants some actual data
    fs.stat(file, function(err, stats) {
      if (err) {
        logger(err.message);
        end(res, err.code === 'ENOENT' ? 404 : 500);
        return;
      }

      if (stats.isDirectory()) {
        // directory
        // forbidden
        if (!opts.autoindex) return end(res, 403);

        // json stringify the dir
        fs.readdir(file, function(e, d) {
          if (e) {
            logger(e.message);
            end(res, 500);
            return;
          }
          d.sort();
          d = ['.', '..'].concat(d);
          if (urlparsed.query.hasOwnProperty('json')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.write(JSON.stringify(d));
          } else {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.write('<ul>\n');
            d.forEach(function(name) {
              res.write('<li>' + name.link(path.join(urlparsed.pathname, name)) + '</li>\n');
            });
            res.write('</ul>\n');
          }
          res.end();
        });
      } else {
        // file
        var etag = '"' + stats.size + '-' + stats.mtime.getTime() + '"';
        res.setHeader('Last-Modified', stats.mtime.toUTCString());

        // check cache
        if (req.headers['if-none-match'] === etag) {
          end(res, 304);
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
