const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const notFoundPage = path.join(rootDir, '404.html');

app.use(express.static(rootDir, { extensions: ['html'] }));

app.use((req, res, next) => {
  const pathname = req.path;

  if (pathname === '/') {
    return next();
  }

  const hasExtension = path.extname(pathname);

  if (!hasExtension) {
    const htmlCandidate = path.join(rootDir, `${pathname}.html`);
    if (fs.existsSync(htmlCandidate) && fs.statSync(htmlCandidate).isFile()) {
      return res.sendFile(htmlCandidate);
    }
  }

  const requestedPath = path.join(rootDir, pathname);
  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return next();
  }

  return res.status(404).sendFile(notFoundPage);
});

app.use((req, res) => {
  res.status(404).sendFile(notFoundPage);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Unknown routes will be redirected to 404.html');
});
