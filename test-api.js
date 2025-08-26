#!/usr/bin/env node

const http = require('http');

const testEndpoint = (path) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data,
          path: path
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout for ${path}`));
    });

    req.end();
  });
};

async function runTests() {
  console.log('🧪 Testing Fantasy PL Proxy API...\n');

  const endpoints = [
    '/health',
    '/bootstrap-static'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`📊 Testing ${endpoint}...`);
      const result = await testEndpoint(endpoint);
      console.log(`✅ ${endpoint} - Status: ${result.status}`);

      if (endpoint === '/health') {
        const healthData = JSON.parse(result.data);
        console.log(`   Service: ${healthData.service || 'Unknown'}`);
      }

      console.log('');
    } catch (error) {
      console.log(`❌ ${endpoint} - Error: ${error.message}\n`);
    }
  }

  console.log('🎉 API testing completed!');
}

runTests();
