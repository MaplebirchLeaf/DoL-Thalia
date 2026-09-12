const exec = require('cordova/exec');

exports.download = url =>
  new Promise((resolve, reject) => {
    exec(resolve, reject, 'ThaliaNativeDownload', 'download', [url]);
  });
