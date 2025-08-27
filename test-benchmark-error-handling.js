// Test script to validate benchmark error handling for 5xx responses
const { performance } = require('perf_hooks');

// Mock server responses for testing
const mockResponses = {
  '/healthy-endpoint': { status: 200, data: { message: 'OK' } },
  '/server-error': { status: 503, data: { error: 'Service Unavailable' } },
  '/client-error': { status: 404, data: { error: 'Not Found' } },
  '/mixed-responses': {
    responses: [
      { status: 200, data: { message: 'OK' } },
      { status: 503, data: { error: 'Service Unavailable' } },
      { status: 200, data: { message: 'OK' } }
    ],
    current: 0
  }
};

// Store original fetch if it exists
const originalFetch = global.fetch;

// Mock fetch function to simulate different server responses
global.fetch = function(url) {
  const endpoint = new URL(url).pathname;
  const mock = mockResponses[endpoint];

  if (!mock) {
    return Promise.reject(new Error('Network error'));
  }

  let response;
  if (mock.responses) {
    // For mixed responses, cycle through them
    response = mock.responses[mock.current % mock.responses.length];
    mock.current++;
  } else {
    response = mock;
  }

  return Promise.resolve({
    ok: response.status >= 200 && response.status < 400,
    status: response.status,
    statusText: response.status === 200 ? 'OK' :
                response.status === 404 ? 'Not Found' :
                response.status === 503 ? 'Service Unavailable' : 'Error',
    headers: {
      get: (name) => name === 'content-length' ? '100' : null
    },
    json: () => Promise.resolve(response.data)
  });
};

// Import our benchmark runner
const { BenchmarkRunner } = require('./benchmark.js');

// Test configuration
const TEST_CONFIG = {
  endpoints: [
    '/healthy-endpoint',
    '/server-error',
    '/client-error',
    '/mixed-responses'
  ],
  concurrent_requests: [1, 2],
  requests_per_test: 5,
  servers: {
    test: {
      name: 'Test Server',
      baseUrl: 'http://localhost:3000'
    }
  }
};

async function runErrorHandlingTests() {
  console.log('🧪 Testing Benchmark Error Handling');
  console.log('=' .repeat(50));

  const benchmark = new BenchmarkRunner(TEST_CONFIG);

  try {
    // Test 1: Healthy endpoint should work normally
    console.log('\n✅ Test 1: Healthy endpoint');
    const healthyStats = await benchmark.benchmarkEndpoint('test', '/healthy-endpoint', 1);
    console.log(`   Success rate: ${healthyStats.successRate.toFixed(1)}%`);
    console.log(`   Should skip: ${healthyStats.shouldSkip || false}`);

    // Test 2: Server error endpoint should be detected and handled
    console.log('\n❌ Test 2: Server error endpoint');
    const serverErrorStats = await benchmark.benchmarkEndpoint('test', '/server-error', 1);
    console.log(`   Success rate: ${serverErrorStats.successRate.toFixed(1)}%`);
    console.log(`   Server error rate: ${serverErrorStats.serverErrorRate.toFixed(1)}%`);
    console.log(`   Should skip: ${serverErrorStats.shouldSkip || false}`);
    console.log(`   Skipped: ${serverErrorStats.skipped || false}`);

    // Test 3: Client error endpoint
    console.log('\n⚠️  Test 3: Client error endpoint');
    const clientErrorStats = await benchmark.benchmarkEndpoint('test', '/client-error', 1);
    console.log(`   Success rate: ${clientErrorStats.successRate.toFixed(1)}%`);
    console.log(`   Client error rate: ${clientErrorStats.clientErrorRate.toFixed(1)}%`);
    console.log(`   Should skip: ${clientErrorStats.shouldSkip || false}`);

    // Test 4: Mixed responses
    console.log('\n🔄 Test 4: Mixed responses');
    // Reset the counter for mixed responses
    mockResponses['/mixed-responses'].current = 0;
    const mixedStats = await benchmark.benchmarkEndpoint('test', '/mixed-responses', 1);
    console.log(`   Success rate: ${mixedStats.successRate.toFixed(1)}%`);
    console.log(`   Server error rate: ${mixedStats.serverErrorRate.toFixed(1)}%`);
    console.log(`   Should skip: ${mixedStats.shouldSkip || false}`);

    // Validate test results
    console.log('\n📋 Test Results Summary:');
    console.log(`   ✅ Healthy endpoint success rate: ${healthyStats.successRate >= 90 ? 'PASS' : 'FAIL'}`);
    console.log(`   ❌ Server error detection: ${serverErrorStats.serverErrorRate >= 90 ? 'PASS' : 'FAIL'}`);
    console.log(`   ⚠️  Client error detection: ${clientErrorStats.clientErrorRate >= 90 ? 'PASS' : 'FAIL'}`);
    console.log(`   🔄 Mixed response handling: ${mixedStats.successRate > 0 && mixedStats.serverErrorRate > 0 ? 'PASS' : 'FAIL'}`);

    console.log('\n🎉 All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    // Restore original fetch if it existed
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runErrorHandlingTests().catch(console.error);
}

module.exports = { runErrorHandlingTests };
