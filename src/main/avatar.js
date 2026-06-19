const http = require('http');
const path = require('path');
const fs = require('fs');

const AVATAR_PORT = 47832;

let server = null;

function defaultAvatarPath() {
  return path.join(__dirname, '..', '..', 'assets', 'visionpfp.png');
}

function storagePath(userData, ext) {
  return path.join(userData, `profile-avatar${ext}`);
}

function toExternalImageKey(url) {
  const u = new URL(url);
  const host = Buffer.from(u.hostname).toString('base64').replace(/=+$/, '');
  const pathname = Buffer.from(u.pathname).toString('base64').replace(/=+$/, '');
  return `mp:external/${host}/${pathname}`;
}

function startServer(filePath) {
  return new Promise((resolve) => {
    stopServer();
    if (!filePath || !fs.existsSync(filePath)) {
      resolve(null);
      return;
    }

    server = http.createServer((req, res) => {
      if (req.url !== '/avatar') {
        res.statusCode = 404;
        res.end();
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      res.setHeader('Content-Type', types[ext] || 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        res.statusCode = 500;
        res.end();
      });
      stream.pipe(res);
    });

    server.on('error', (err) => {
      console.error('Avatar server error:', err.message);
      resolve(null);
    });

    server.listen(AVATAR_PORT, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${AVATAR_PORT}/avatar`);
    });
  });
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = {
  AVATAR_PORT,
  defaultAvatarPath,
  storagePath,
  startServer,
  stopServer,
};
