#!/usr/bin/env pwsh

# Test script for Fantasy PL Proxy API
$BaseUrl = "http://localhost:3000"

Write-Host "🧪 Testing Fantasy PL Proxy API..." -ForegroundColor Green

# Test health endpoint
Write-Host "`n📊 Testing health endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET
    Write-Host "✅ Health check passed:" -ForegroundColor Green
    $healthResponse | ConvertTo-Json -Depth 3
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test bootstrap-static endpoint
Write-Host "`n📈 Testing bootstrap-static endpoint..." -ForegroundColor Yellow
try {
    $bootstrapResponse = Invoke-RestMethod -Uri "$BaseUrl/bootstrap-static" -Method GET -TimeoutSec 30
    if ($bootstrapResponse.events) {
        Write-Host "✅ Bootstrap data fetched successfully. Found $($bootstrapResponse.events.Count) gameweeks" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Bootstrap data structure unexpected" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Bootstrap test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test fixtures endpoint
Write-Host "`n⚽ Testing fixtures endpoint..." -ForegroundColor Yellow
try {
    $fixturesResponse = Invoke-RestMethod -Uri "$BaseUrl/fixtures" -Method GET -TimeoutSec 30
    if ($fixturesResponse -is [Array]) {
        Write-Host "✅ Fixtures fetched successfully. Found $($fixturesResponse.Count) fixtures" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Fixtures data structure unexpected" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Fixtures test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 API testing completed!" -ForegroundColor Green
