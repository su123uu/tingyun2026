const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'vite-dev.out.log');
const errFile = path.join(__dirname, 'vite-dev.err.log');

function write(file, text) {
  fs.appendFileSync(file, `${new Date().toISOString()} ${text}\n`);
}

process.on('uncaughtException', (error) => {
  write(errFile, error.stack || error.message || String(error));
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  write(errFile, error && error.stack ? error.stack : String(error));
  process.exit(1);
});

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: __dirname,
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
  });

  await server.listen();
  write(logFile, 'Vite dev server listening at http://localhost:5173/ and http://127.0.0.1:5173/');
})();
