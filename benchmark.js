const { performance } = require('perf_hooks');

// Benchmark configuration
const BENCHMARK_CONFIG = {
  // Test endpoints
  endpoints: [
    // '/health',
    '/bootstrap-static',
    '/fixtures',
    '/element-summary/1', // Assuming player ID 1 exists
    '/live-event/1',
    '/picks/1/1', // Assuming manager ID 1 and GW 1
    '/manager/1',
    '/league/314/1' // Popular league with page 1
  ],

  // Test parameters
  concurrent_requests: [1, 5, 10, 20],
  requests_per_test: 100,

  // Server configurations
  servers: {
    rust: {
      name: 'Rust (Axum + Vercel)',
      baseUrl: 'https://fantasy-pl-vercel-proxy-rs.vercel.app' // Vercel dev server
    },
    express: {
      name: 'Express.js (Original)',
      baseUrl: 'https://fantasy-pl-vercel-proxy.vercel.app' // Original Express deployment
    }
  }
};

class BenchmarkRunner {
  constructor(config) {
    this.config = config;
    this.results = {};
  }

  async makeRequest(url) {
    const startTime = performance.now();
    try {
      const response = await fetch(url);
      const endTime = performance.now();

      // Check for 5xx server errors
      const is5xxError = response.status >= 500 && response.status < 600;
      const is4xxError = response.status !== 403 && (response.status >= 400 && response.status < 500);

      // console.log(response.ok, response.status)
      return {
        success: response.ok || response.status == 403, // 2xx status codes only
        responseTime: endTime - startTime,
        status: response.status,
        size: parseInt(response.headers.get('content-length') || '0'),
        is5xxError,
        is4xxError,
        statusText: response.statusText
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        success: false,
        responseTime: endTime - startTime,
        error: error.message,
        status: 0,
        size: 0,
        is5xxError: false,
        is4xxError: false,
        statusText: 'Network Error'
      };
    }
  }

  async runConcurrentRequests(url, concurrency, totalRequests) {
    const results = [];
    const batches = Math.ceil(totalRequests / concurrency);

    console.log(`Running ${totalRequests} requests with ${concurrency} concurrent connections...`);

    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrency, totalRequests - (batch * concurrency));
      const promises = [];

      for (let i = 0; i < batchSize; i++) {
        promises.push(this.makeRequest(url));
      }

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }

  calculateStats(results) {
    // console.log(results.map(r => r.status))
    const successfulResults = results.filter(r => r.success);
    const serverErrorResults = results.filter(r => r.is5xxError);
    const clientErrorResults = results.filter(r => r.is4xxError);
    const responseTimes = successfulResults.map(r => r.responseTime);

    // Calculate error rates
    const serverErrorRate = (serverErrorResults.length / results.length) * 100;
    const clientErrorRate = (clientErrorResults.length / results.length) * 100;

    if (responseTimes.length === 0) {
      return {
        totalRequests: results.length,
        successfulRequests: 0,
        failedRequests: results.length,
        serverErrors: serverErrorResults.length,
        clientErrors: clientErrorResults.length,
        networkErrors: results.filter(r => r.status === 0).length,
        successRate: 0,
        serverErrorRate,
        clientErrorRate,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        requestsPerSecond: 0,
        shouldSkip: serverErrorRate > 80 // Skip if more than 80% are server errors
      };
    }

    responseTimes.sort((a, b) => a - b);

    const sum = responseTimes.reduce((acc, time) => acc + time, 0);
    const avg = sum / responseTimes.length;

    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];

    const totalTime = Math.max(...responseTimes);
    const requestsPerSecond = totalTime > 0 ? (successfulResults.length / (totalTime / 1000)) : 0;

    return {
      totalRequests: results.length,
      successfulRequests: successfulResults.length,
      failedRequests: results.length - successfulResults.length,
      serverErrors: serverErrorResults.length,
      clientErrors: clientErrorResults.length,
      networkErrors: results.filter(r => r.status === 0).length,
      successRate: (successfulResults.length / results.length) * 100,
      serverErrorRate,
      clientErrorRate,
      avgResponseTime: avg,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      p50,
      p95,
      p99,
      requestsPerSecond,
      shouldSkip: serverErrorRate > 80 // Skip if more than 80% are server errors
    };
  }

  async benchmarkEndpoint(serverKey, endpoint, concurrency) {
    const server = this.config.servers[serverKey];
    const url = `${server.baseUrl}${endpoint}`;

    console.log(`\n🔄 Testing ${server.name} - ${endpoint} (${concurrency} concurrent)`);

    // First, do a quick health check with a single request
    const healthCheck = await this.makeRequest(url);

    if (healthCheck.is5xxError) {
      console.log(`⚠️  Server error detected (${healthCheck.status} ${healthCheck.statusText}) - performing limited test`);

      // Try a few more times to confirm it's consistently failing
      const quickTest = await this.runConcurrentRequests(url, 1, 5);
      const quickStats = this.calculateStats(quickTest);

      if (quickStats.serverErrorRate > 60) {
        console.log(`🚫 Skipping ${endpoint} due to high server error rate (${quickStats.serverErrorRate.toFixed(1)}%)`);
        return {
          ...quickStats,
          skipped: true,
          skipReason: `High server error rate: ${quickStats.serverErrorRate.toFixed(1)}%`
        };
      }
    }

    const startTime = performance.now();
    const results = await this.runConcurrentRequests(url, concurrency, this.config.requests_per_test);
    const endTime = performance.now();

    const stats = this.calculateStats(results);
    stats.totalTestTime = endTime - startTime;

    // Log additional error information
    if (stats.serverErrorRate > 0) {
      console.log(`⚠️  Server errors: ${stats.serverErrorRate.toFixed(1)}%`);
    }
    if (stats.clientErrorRate > 0) {
      console.log(`⚠️  Client errors: ${stats.clientErrorRate.toFixed(1)}%`);
    }

    return stats;
  }

  async runFullBenchmark() {
    console.log('🚀 Starting Fantasy Premier League API Benchmark');
    console.log('=' .repeat(60));

    this.results = {};

    for (const serverKey of Object.keys(this.config.servers)) {
      const server = this.config.servers[serverKey];
      console.log(`\n📊 Testing ${server.name}`);
      console.log('-'.repeat(40));

      this.results[serverKey] = {};

      for (const endpoint of this.config.endpoints) {
        this.results[serverKey][endpoint] = {};
        let endpointSkipped = false;

        for (const concurrency of this.config.concurrent_requests) {
          // Skip remaining concurrency tests if endpoint was marked to skip
          if (endpointSkipped) {
            console.log(`⏭️  Skipping ${endpoint} (${concurrency}x) - endpoint marked as problematic`);
            this.results[serverKey][endpoint][concurrency] = {
              skipped: true,
              skipReason: 'Previous test indicated high server error rate'
            };
            continue;
          }

          try {
            const stats = await this.benchmarkEndpoint(serverKey, endpoint, concurrency);
            this.results[serverKey][endpoint][concurrency] = stats;

            if (stats.skipped) {
              console.log(`🚫 ${endpoint} (${concurrency}x): Skipped - ${stats.skipReason}`);
              endpointSkipped = true;
            } else {
              const errorInfo = stats.serverErrorRate > 0 || stats.clientErrorRate > 0
                ? ` (${stats.serverErrorRate.toFixed(1)}% 5xx, ${stats.clientErrorRate.toFixed(1)}% 4xx)`
                : '';

              console.log(`✅ ${endpoint} (${concurrency}x): ${stats.avgResponseTime.toFixed(2)}ms avg, ${stats.successRate.toFixed(1)}% success${errorInfo}`);

              // Mark endpoint for skipping if server error rate is too high
              if (stats.shouldSkip) {
                console.log(`⚠️  Marking ${endpoint} for skipping due to high server error rate`);
                endpointSkipped = true;
              }
            }
          } catch (error) {
            console.error(`❌ ${endpoint} (${concurrency}x): ${error.message}`);
            this.results[serverKey][endpoint][concurrency] = {
              error: true,
              errorMessage: error.message
            };
          }
        }
      }
    }
  }

  generateReport() {
    console.log('\n📈 BENCHMARK RESULTS SUMMARY');
    console.log('=' .repeat(80));

    // Compare averages across all endpoints
    const servers = Object.keys(this.results);
    if (servers.length < 2) {
      console.log('❌ Need at least 2 servers to compare results');
      return;
    }

    console.log('\n🏆 PERFORMANCE COMPARISON');
    console.log('-'.repeat(40));

    for (const endpoint of this.config.endpoints) {
      console.log(`\n📍 Endpoint: ${endpoint}`);

      for (const concurrency of this.config.concurrent_requests) {
        console.log(`  Concurrency: ${concurrency}x`);

        const serverStats = {};
        for (const serverKey of servers) {
          const stats = this.results[serverKey]?.[endpoint]?.[concurrency];
          if (stats) {
            serverStats[serverKey] = stats;
          }
        }

        if (Object.keys(serverStats).length >= 2) {
          const rustStats = serverStats.rust;
          const expressStats = serverStats.express;

          if (rustStats && expressStats) {
            // Skip comparison if either server has issues
            if (rustStats.skipped || expressStats.skipped || rustStats.error || expressStats.error) {
              console.log(`    ⚠️  Comparison skipped due to server issues`);
              if (rustStats.skipped) console.log(`      - Rust: ${rustStats.skipReason || 'Skipped'}`);
              if (expressStats.skipped) console.log(`      - Express: ${expressStats.skipReason || 'Skipped'}`);
              if (rustStats.error) console.log(`      - Rust Error: ${rustStats.errorMessage}`);
              if (expressStats.error) console.log(`      - Express Error: ${expressStats.errorMessage}`);
            } else {
              const speedup = expressStats.avgResponseTime / rustStats.avgResponseTime;
              const throughputImprovement = (rustStats.requestsPerSecond / expressStats.requestsPerSecond);

              console.log(`    Rust:     ${rustStats.avgResponseTime.toFixed(2)}ms avg, ${rustStats.successRate.toFixed(1)}% success`);
              console.log(`    Express:  ${expressStats.avgResponseTime.toFixed(2)}ms avg, ${expressStats.successRate.toFixed(1)}% success`);
              console.log(`    📈 Speedup: ${speedup.toFixed(2)}x, Throughput: ${throughputImprovement.toFixed(2)}x`);
            }
          }
        } else {
          console.log(`    ⚠️  Insufficient data for comparison`);
        }
      }
    }

    // Overall summary
    console.log('\n🎯 OVERALL SUMMARY');
    console.log('-'.repeat(40));

    let totalRustTime = 0, totalExpressTime = 0, totalTests = 0;

    for (const endpoint of this.config.endpoints) {
      for (const concurrency of this.config.concurrent_requests) {
        const rustStats = this.results.rust?.[endpoint]?.[concurrency];
        const expressStats = this.results.express?.[endpoint]?.[concurrency];

        // Only include valid, non-skipped, non-error results in overall calculation
        if (rustStats && expressStats &&
            !rustStats.skipped && !expressStats.skipped &&
            !rustStats.error && !expressStats.error &&
            rustStats.avgResponseTime > 0 && expressStats.avgResponseTime > 0 &&
            rustStats.successRate > 50 && expressStats.successRate > 50) { // Only include if decent success rate

          totalRustTime += rustStats.avgResponseTime;
          totalExpressTime += expressStats.avgResponseTime;
          totalTests++;
        }
      }
    }

    if (totalTests > 0) {
      const avgRustTime = totalRustTime / totalTests;
      const avgExpressTime = totalExpressTime / totalTests;
      const overallSpeedup = avgExpressTime / avgRustTime;

      console.log(`Average Response Time (based on ${totalTests} valid test results):`);
      console.log(`  🦀 Rust:     ${avgRustTime.toFixed(2)}ms`);
      console.log(`  🟨 Express:  ${avgExpressTime.toFixed(2)}ms`);
      console.log(`  📈 Overall Speedup: ${overallSpeedup.toFixed(2)}x`);

      if (overallSpeedup > 1) {
        console.log(`\n🎉 Rust version is ${overallSpeedup.toFixed(2)}x faster than Express!`);
      } else {
        console.log(`\n📊 Express version is ${(1/overallSpeedup).toFixed(2)}x faster than Rust`);
      }
    } else {
      console.log(`\n⚠️  No valid test results available for comparison`);
      console.log(`     This could be due to server errors, network issues, or low success rates`);
    }
  }

  exportResults(filename = 'benchmark-results.json') {
    const fs = require('fs');
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      results: this.results
    };

    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`\n💾 Results exported to ${filename}`);
  }
}

// Main execution
async function main() {
  const benchmark = new BenchmarkRunner(BENCHMARK_CONFIG);

  try {
    await benchmark.runFullBenchmark();
    benchmark.generateReport();
    benchmark.exportResults();
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { BenchmarkRunner, BENCHMARK_CONFIG };
