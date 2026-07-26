const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const cloudflared = path.join(__dirname, 'node_modules', 'cloudflared', 'bin', 'cloudflared.exe');
const tunnel = spawn(cloudflared, ['tunnel', '--url', 'http://localhost:3000'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let urlFound = false;

function checkUrl(text) {
  if (urlFound) return;
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match) {
    urlFound = true;
    // Write URL to a file so other processes can read it
    fs.writeFileSync(path.join(__dirname, 'tunnel_url.txt'), match[0]);
    console.log('\n  ===============================================');
    console.log('  ✅ TUNEL INTERNET ACTIVO (Cloudflare)');
    console.log('  🌐 URL: ' + match[0]);
    console.log('  ⚡ Sin páginas intermedias');
    console.log('  ===============================================');
    console.log('  Mantén esta ventana abierta.');
    console.log('  Presiona Ctrl+C para cerrar el túnel.\n');
  }
}

tunnel.stdout.on('data', (data) => { checkUrl(data.toString()); });
tunnel.stderr.on('data', (data) => { checkUrl(data.toString()); });

tunnel.on('exit', (code) => {
  console.log('\n  ❌ Túnel cerrado (código ' + code + ')\n');
});
