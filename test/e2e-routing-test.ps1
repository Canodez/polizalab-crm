# End-to-End Routing Test Script
# Tests CloudFront routing behavior for static site
# Requirements: 1.1, 1.2, 2.1

param(
    [string]$Domain = "https://crm.antesdefirmar.org"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "End-to-End Routing Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing domain: $Domain" -ForegroundColor Gray
Write-Host ""

$failures = @()
$warnings = @()
$testCount = 0
$passCount = 0

function Test-Route {
    param(
        [string]$Path,
        [int]$ExpectedStatus,
        [string]$Description,
        [string]$ContentCheck = $null
    )
    
    $testCount++
    Write-Host "Test $testCount`: $Description" -ForegroundColor Yellow
    Write-Host "  URL: $Domain$Path" -ForegroundColor Gray
    
    try {
        # Make request and capture response
        $response = Invoke-WebRequest -Uri "$Domain$Path" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue
        $statusCode = $response.StatusCode
        $content = $response.Content
        
        # Check status code
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  ✓ Status code: $statusCode (expected: $ExpectedStatus)" -ForegroundColor Green
            
            # Check content if specified
            if ($ContentCheck) {
                if ($content -match $ContentCheck) {
                    Write-Host "  ✓ Content check passed: found '$ContentCheck'" -ForegroundColor Green
                    $script:passCount++
                } else {
                    Write-Host "  ✗ Content check failed: '$ContentCheck' not found" -ForegroundColor Red
                    $script:failures += "Test $testCount ($Path): Content check failed"
                }
            } else {
                $script:passCount++
            }
        } else {
            Write-Host "  ✗ Status code: $statusCode (expected: $ExpectedStatus)" -ForegroundColor Red
            $script:failures += "Test $testCount ($Path): Expected $ExpectedStatus but got $statusCode"
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.Value__
        
        if ($statusCode -eq $ExpectedStatus) {
            Write-Host "  ✓ Status code: $statusCode (expected: $ExpectedStatus)" -ForegroundColor Green
            $script:passCount++
        } else {
            Write-Host "  ✗ Status code: $statusCode (expected: $ExpectedStatus)" -ForegroundColor Red
            $script:failures += "Test $testCount ($Path): Expected $ExpectedStatus but got $statusCode"
        }
    }
    
    Write-Host ""
}

# Test 1: Root path returns 200
Test-Route -Path "/" -ExpectedStatus 200 -Description "Root path (/) returns 200" -ContentCheck "PolizaLab|CRM"

# Test 2: /register without trailing slash returns 200
Test-Route -Path "/register" -ExpectedStatus 200 -Description "/register (no trailing slash) returns 200" -ContentCheck "register|Register|Registro"

# Test 3: /register with trailing slash returns 200
Test-Route -Path "/register/" -ExpectedStatus 200 -Description "/register/ (with trailing slash) returns 200" -ContentCheck "register|Register|Registro"

# Test 4: /login without trailing slash returns 200
Test-Route -Path "/login" -ExpectedStatus 200 -Description "/login (no trailing slash) returns 200" -ContentCheck "login|Login|Iniciar"

# Test 5: /login with trailing slash returns 200
Test-Route -Path "/login/" -ExpectedStatus 200 -Description "/login/ (with trailing slash) returns 200" -ContentCheck "login|Login|Iniciar"

# Test 6: /profile without trailing slash returns 200 (may require auth, so we check for 200 or 401/403)
Write-Host "Test $($testCount + 1): /profile (no trailing slash) returns 200 or auth error" -ForegroundColor Yellow
Write-Host "  URL: $Domain/profile" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "$Domain/profile" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue
    $statusCode = $response.StatusCode
    if ($statusCode -eq 200) {
        Write-Host "  ✓ Status code: 200 (page accessible)" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  ⚠ Status code: $statusCode (unexpected)" -ForegroundColor Yellow
        $warnings += "Test $($testCount + 1) (/profile): Got $statusCode"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Write-Host "  ✓ Status code: $statusCode (auth required, routing works)" -ForegroundColor Green
        $passCount++
    } elseif ($statusCode -eq 200) {
        Write-Host "  ✓ Status code: 200 (page accessible)" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  ✗ Status code: $statusCode (unexpected)" -ForegroundColor Red
        $failures += "Test $($testCount + 1) (/profile): Expected 200/401/403 but got $statusCode"
    }
}
$testCount++
Write-Host ""

# Test 7: Non-existent path returns 404
Test-Route -Path "/this-page-does-not-exist-12345" -ExpectedStatus 404 -Description "Non-existent path returns 404 (not 200)"

# Test 8: Non-existent nested path returns 404
Test-Route -Path "/nonexistent/nested/path" -ExpectedStatus 404 -Description "Non-existent nested path returns 404"

# Test 9: Verify /register serves correct content (not home page)
Write-Host "Test $($testCount + 1): /register serves correct content (not home page)" -ForegroundColor Yellow
Write-Host "  URL: $Domain/register" -ForegroundColor Gray
try {
    $registerResponse = Invoke-WebRequest -Uri "$Domain/register" -Method GET -UseBasicParsing
    $homeResponse = Invoke-WebRequest -Uri "$Domain/" -Method GET -UseBasicParsing
    
    # Check that register page is different from home page
    if ($registerResponse.Content -ne $homeResponse.Content) {
        Write-Host "  ✓ /register serves different content than home page" -ForegroundColor Green
        
        # Additional check: register page should contain register-specific content
        if ($registerResponse.Content -match "register|Register|Registro|Sign up|Crear cuenta") {
            Write-Host "  ✓ /register contains registration-specific content" -ForegroundColor Green
            $passCount++
        } else {
            Write-Host "  ⚠ /register doesn't contain obvious registration content" -ForegroundColor Yellow
            $warnings += "Test $($testCount + 1): /register may not have registration-specific content"
            $passCount++
        }
    } else {
        Write-Host "  ✗ /register serves same content as home page (routing broken)" -ForegroundColor Red
        $failures += "Test $($testCount + 1): /register serves home page content"
    }
} catch {
    Write-Host "  ✗ Failed to fetch pages for comparison: $_" -ForegroundColor Red
    $failures += "Test $($testCount + 1): Failed to compare /register and / content"
}
$testCount++
Write-Host ""

# Test 10: Verify static assets are accessible
Test-Route -Path "/favicon.ico" -ExpectedStatus 200 -Description "Static asset (favicon.ico) is accessible"

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total tests: $testCount" -ForegroundColor Gray
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $($failures.Count)" -ForegroundColor $(if ($failures.Count -eq 0) { "Green" } else { "Red" })
Write-Host "Warnings: $($warnings.Count)" -ForegroundColor $(if ($warnings.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($failures.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✓ All end-to-end routing tests passed!" -ForegroundColor Green
    exit 0
} elseif ($failures.Count -eq 0) {
    Write-Host "⚠ All tests passed but with warnings:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
    exit 0
} else {
    Write-Host "✗ Some tests failed:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    if ($warnings.Count -gt 0) {
        Write-Host ""
        Write-Host "Warnings:" -ForegroundColor Yellow
        foreach ($warning in $warnings) {
            Write-Host "  - $warning" -ForegroundColor Yellow
        }
    }
    exit 1
}
