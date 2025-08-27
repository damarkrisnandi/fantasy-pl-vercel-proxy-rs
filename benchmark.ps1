# Fantasy Premier League API Benchmark Script
# Compares Rust vs Express.js performance

param(
    [string]$RustUrl = "http://localhost:3000",
    [string]$ExpressUrl = "https://fantasy-pl-vercel-proxy.vercel.app",
    [int]$RequestsPerTest = 50,
    [array]$ConcurrentLevels = @(1, 5, 10, 20)
)

$ErrorActionPreference = "Stop"

# Test endpoints
$endpoints = @(
    "/health",
    "/bootstrap-static",
    "/fixtures"
    # Add more endpoints as needed
)

# Servers to test
$servers = @{
    "rust" = @{
        "name" = "Rust (Axum + Vercel)"
        "url" = $RustUrl
    }
    "express" = @{
        "name" = "Express.js (Original)"
        "url" = $ExpressUrl
    }
}

function Test-Endpoint {
    param(
        [string]$Url,
        [int]$Concurrency,
        [int]$TotalRequests
    )

    Write-Host "Testing $Url with $Concurrency concurrent requests..." -ForegroundColor Yellow

    # First, do a quick health check
    $healthCheckStart = Get-Date
    try {
        $healthResponse = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 10
        $healthCheckEnd = Get-Date

        if ($healthResponse.StatusCode -ge 500 -and $healthResponse.StatusCode -lt 600) {
            Write-Host "⚠️  Server error detected ($($healthResponse.StatusCode)) - performing limited test" -ForegroundColor Yellow

            # Do a quick test with fewer requests
            $quickTestResults = @()
            for ($i = 0; $i -lt 3; $i++) {
                try {
                    $testResponse = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 10
                    $quickTestResults += @{
                        Success = $testResponse.StatusCode -ge 200 -and $testResponse.StatusCode -lt 400
                        Status = $testResponse.StatusCode
                        Is5xxError = $testResponse.StatusCode -ge 500 -and $testResponse.StatusCode -lt 600
                    }
                } catch {
                    $quickTestResults += @{
                        Success = $false
                        Status = 0
                        Is5xxError = $false
                        Error = $_.Exception.Message
                    }
                }
            }

            $serverErrorCount = ($quickTestResults | Where-Object { $_.Is5xxError -eq $true }).Count
            $serverErrorRate = ($serverErrorCount / $quickTestResults.Count) * 100

            if ($serverErrorRate -gt 60) {
                Write-Host "🚫 Skipping endpoint due to high server error rate ($($serverErrorRate.ToString('F1'))%)" -ForegroundColor Red
                return @{
                    Skipped = $true
                    SkipReason = "High server error rate: $($serverErrorRate.ToString('F1'))%"
                    ServerErrorRate = $serverErrorRate
                }
            }
        }
    } catch {
        Write-Host "⚠️  Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    $jobs = @()
    $results = @()

    # Create concurrent jobs
    for ($i = 0; $i -lt $Concurrency; $i++) {
        $requestsPerJob = [math]::Floor($TotalRequests / $Concurrency)
        if ($i -eq ($Concurrency - 1)) {
            $requestsPerJob += $TotalRequests % $Concurrency
        }

        $job = Start-Job -ScriptBlock {
            param($url, $count)
            $results = @()

            for ($j = 0; $j -lt $count; $j++) {
                $startTime = Get-Date
                try {
                    $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 30
                    $endTime = Get-Date
                    $responseTime = ($endTime - $startTime).TotalMilliseconds

                    $results += @{
                        Success = $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
                        ResponseTime = $responseTime
                        Status = $response.StatusCode
                        Is5xxError = $response.StatusCode -ge 500 -and $response.StatusCode -lt 600
                        Is4xxError = $response.StatusCode -ge 400 -and $response.StatusCode -lt 500
                        StatusText = $response.StatusDescription
                    }
                } catch {
                    $endTime = Get-Date
                    $responseTime = ($endTime - $startTime).TotalMilliseconds

                    $results += @{
                        Success = $false
                        ResponseTime = $responseTime
                        Status = 0
                        Is5xxError = $false
                        Is4xxError = $false
                        StatusText = "Network Error"
                        Error = $_.Exception.Message
                    }
                }
            }
            return $results
        } -ArgumentList $Url, $requestsPerJob

        $jobs += $job
    }

    # Wait for all jobs and collect results
    foreach ($job in $jobs) {
        $jobResults = Receive-Job -Job $job -Wait
        $results += $jobResults
        Remove-Job -Job $job
    }

    return $results
}

function Calculate-Stats {
    param([array]$Results)

    if ($Results.Count -eq 0) {
        return @{
            TotalRequests = 0
            SuccessfulRequests = 0
            FailedRequests = 0
            SuccessRate = 0
            ServerErrorRate = 0
            ClientErrorRate = 0
            AvgResponseTime = 0
            MinResponseTime = 0
            MaxResponseTime = 0
        }
    }

    $successful = $Results | Where-Object { $_.Success -eq $true }
    $serverErrors = $Results | Where-Object { $_.Is5xxError -eq $true }
    $clientErrors = $Results | Where-Object { $_.Is4xxError -eq $true }
    $networkErrors = $Results | Where-Object { $_.Status -eq 0 }

    $responseTimes = $successful | ForEach-Object { $_.ResponseTime }

    if ($responseTimes.Count -eq 0) {
        return @{
            TotalRequests = $Results.Count
            SuccessfulRequests = 0
            FailedRequests = $Results.Count
            ServerErrors = $serverErrors.Count
            ClientErrors = $clientErrors.Count
            NetworkErrors = $networkErrors.Count
            SuccessRate = 0
            ServerErrorRate = ($serverErrors.Count / $Results.Count) * 100
            ClientErrorRate = ($clientErrors.Count / $Results.Count) * 100
            AvgResponseTime = 0
            MinResponseTime = 0
            MaxResponseTime = 0
            ShouldSkip = (($serverErrors.Count / $Results.Count) * 100) -gt 80
        }
    }

    $avgResponseTime = ($responseTimes | Measure-Object -Average).Average
    $minResponseTime = ($responseTimes | Measure-Object -Minimum).Minimum
    $maxResponseTime = ($responseTimes | Measure-Object -Maximum).Maximum

    return @{
        TotalRequests = $Results.Count
        SuccessfulRequests = $successful.Count
        FailedRequests = $Results.Count - $successful.Count
        ServerErrors = $serverErrors.Count
        ClientErrors = $clientErrors.Count
        NetworkErrors = $networkErrors.Count
        SuccessRate = ($successful.Count / $Results.Count) * 100
        ServerErrorRate = ($serverErrors.Count / $Results.Count) * 100
        ClientErrorRate = ($clientErrors.Count / $Results.Count) * 100
        AvgResponseTime = $avgResponseTime
        MinResponseTime = $minResponseTime
        MaxResponseTime = $maxResponseTime
        ShouldSkip = (($serverErrors.Count / $Results.Count) * 100) -gt 80
    }
}

function Run-Benchmark {
    Write-Host "🚀 Starting Fantasy Premier League API Benchmark" -ForegroundColor Green
    Write-Host "=" * 60 -ForegroundColor Green

    $allResults = @{}

    foreach ($serverKey in $servers.Keys) {
        $server = $servers[$serverKey]
        Write-Host "`n📊 Testing $($server.name)" -ForegroundColor Cyan
        Write-Host "-" * 40 -ForegroundColor Cyan

        $allResults[$serverKey] = @{}

        foreach ($endpoint in $endpoints) {
            $allResults[$serverKey][$endpoint] = @{}

            foreach ($concurrency in $ConcurrentLevels) {
                try {
                    $url = "$($server.url)$endpoint"
                    $testResults = Test-Endpoint -Url $url -Concurrency $concurrency -TotalRequests $RequestsPerTest
                    $stats = Calculate-Stats -Results $testResults

                    $allResults[$serverKey][$endpoint][$concurrency] = $stats

                    Write-Host "✅ $endpoint (${concurrency}x): $([math]::Round($stats.AvgResponseTime, 2))ms avg, $([math]::Round($stats.SuccessRate, 1))% success" -ForegroundColor Green

                } catch {
                    Write-Host "❌ $endpoint (${concurrency}x): $($_.Exception.Message)" -ForegroundColor Red
                    $allResults[$serverKey][$endpoint][$concurrency] = $null
                }
            }
        }
    }

    return $allResults
}

function Generate-Report {
    param([hashtable]$Results)

    Write-Host "`n📈 BENCHMARK RESULTS SUMMARY" -ForegroundColor Green
    Write-Host "=" * 80 -ForegroundColor Green

    $serverKeys = $Results.Keys | Where-Object { $Results[$_] -ne $null }
    if ($serverKeys.Count -lt 2) {
        Write-Host "❌ Need at least 2 servers to compare results" -ForegroundColor Red
        return
    }

    Write-Host "`n🏆 PERFORMANCE COMPARISON" -ForegroundColor Yellow
    Write-Host "-" * 40 -ForegroundColor Yellow

    $totalRustTime = 0
    $totalExpressTime = 0
    $totalTests = 0

    foreach ($endpoint in $endpoints) {
        Write-Host "`n📍 Endpoint: $endpoint" -ForegroundColor Cyan

        foreach ($concurrency in $ConcurrentLevels) {
            Write-Host "  Concurrency: ${concurrency}x"

            $rustStats = $Results["rust"][$endpoint][$concurrency]
            $expressStats = $Results["express"][$endpoint][$concurrency]

            if ($rustStats -and $expressStats) {
                # Check if either endpoint was skipped or had errors
                if ($rustStats.Skipped -or $expressStats.Skipped) {
                    Write-Host "    ⚠️  Comparison skipped due to server issues" -ForegroundColor Yellow
                    if ($rustStats.Skipped) { Write-Host "      - Rust: $($rustStats.SkipReason)" -ForegroundColor Yellow }
                    if ($expressStats.Skipped) { Write-Host "      - Express: $($expressStats.SkipReason)" -ForegroundColor Yellow }
                }
                elseif ($rustStats.AvgResponseTime -gt 0 -and $expressStats.AvgResponseTime -gt 0 -and
                        $rustStats.SuccessRate -gt 50 -and $expressStats.SuccessRate -gt 50) {

                    $speedup = $expressStats.AvgResponseTime / $rustStats.AvgResponseTime

                    $rustErrorInfo = ""
                    if ($rustStats.ServerErrorRate -gt 0 -or $rustStats.ClientErrorRate -gt 0) {
                        $rustErrorInfo = " ($([math]::Round($rustStats.ServerErrorRate, 1))% 5xx, $([math]::Round($rustStats.ClientErrorRate, 1))% 4xx)"
                    }

                    $expressErrorInfo = ""
                    if ($expressStats.ServerErrorRate -gt 0 -or $expressStats.ClientErrorRate -gt 0) {
                        $expressErrorInfo = " ($([math]::Round($expressStats.ServerErrorRate, 1))% 5xx, $([math]::Round($expressStats.ClientErrorRate, 1))% 4xx)"
                    }

                    Write-Host "    Rust:     $([math]::Round($rustStats.AvgResponseTime, 2))ms avg, $([math]::Round($rustStats.SuccessRate, 1))% success$rustErrorInfo" -ForegroundColor Green
                    Write-Host "    Express:  $([math]::Round($expressStats.AvgResponseTime, 2))ms avg, $([math]::Round($expressStats.SuccessRate, 1))% success$expressErrorInfo" -ForegroundColor Blue
                    Write-Host "    📈 Speedup: $([math]::Round($speedup, 2))x" -ForegroundColor Yellow

                    $totalRustTime += $rustStats.AvgResponseTime
                    $totalExpressTime += $expressStats.AvgResponseTime
                    $totalTests++
                } else {
                    Write-Host "    ⚠️  Insufficient data for comparison (low success rates or response times)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "    ⚠️  Missing data for comparison" -ForegroundColor Yellow
            }
        }
    }

    # Overall summary
    Write-Host "`n🎯 OVERALL SUMMARY" -ForegroundColor Green
    Write-Host "-" * 40 -ForegroundColor Green

    if ($totalTests -gt 0) {
        $avgRustTime = $totalRustTime / $totalTests
        $avgExpressTime = $totalExpressTime / $totalTests
        $overallSpeedup = $avgExpressTime / $avgRustTime

        Write-Host "Average Response Time (based on $totalTests valid test results):"
        Write-Host "  🦀 Rust:     $([math]::Round($avgRustTime, 2))ms" -ForegroundColor Green
        Write-Host "  🟨 Express:  $([math]::Round($avgExpressTime, 2))ms" -ForegroundColor Blue
        Write-Host "  📈 Overall Speedup: $([math]::Round($overallSpeedup, 2))x" -ForegroundColor Yellow

        if ($overallSpeedup -gt 1) {
            Write-Host "`n🎉 Rust version is $([math]::Round($overallSpeedup, 2))x faster than Express!" -ForegroundColor Green
        } else {
            Write-Host "`n📊 Express version is $([math]::Round((1/$overallSpeedup), 2))x faster than Rust" -ForegroundColor Blue
        }
    } else {
        Write-Host "`n⚠️  No valid test results available for comparison" -ForegroundColor Yellow
        Write-Host "     This could be due to server errors, network issues, or low success rates" -ForegroundColor Yellow
    }
}

function Export-Results {
    param(
        [hashtable]$Results,
        [string]$Filename = "benchmark-results.json"
    )

    $report = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        config = @{
            rustUrl = $RustUrl
            expressUrl = $ExpressUrl
            requestsPerTest = $RequestsPerTest
            concurrentLevels = $ConcurrentLevels
            endpoints = $endpoints
        }
        results = $Results
    }

    $report | ConvertTo-Json -Depth 10 | Out-File -FilePath $Filename -Encoding UTF8
    Write-Host "`n💾 Results exported to $Filename" -ForegroundColor Green
}

# Main execution
try {
    Write-Host "Fantasy Premier League API Performance Benchmark" -ForegroundColor Magenta
    Write-Host "Rust URL: $RustUrl" -ForegroundColor Gray
    Write-Host "Express URL: $ExpressUrl" -ForegroundColor Gray
    Write-Host "Requests per test: $RequestsPerTest" -ForegroundColor Gray
    Write-Host "Concurrency levels: $($ConcurrentLevels -join ', ')" -ForegroundColor Gray
    Write-Host ""

    $results = Run-Benchmark
    Generate-Report -Results $results
    Export-Results -Results $results

} catch {
    Write-Host "❌ Benchmark failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
