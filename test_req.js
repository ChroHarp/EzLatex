const fs = require('fs');
const http = require('http');

const code = fs.readFileSync('temp/main.tex', 'utf8');

const data = JSON.stringify({ code: code });

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/compile',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let responseBody = '';
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    responseBody += chunk;
  });
  res.on('end', () => {
    console.log('No more data in response.');
    console.log(responseBody.slice(0, 500));
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
