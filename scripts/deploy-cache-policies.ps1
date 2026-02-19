# CloudFront Cache Policies Deployment Script
# This script creates cache policies for HTML files and versioned assets
# Requirements: 6.1, 6.2, 6.3

param(
    [Parameter(Mandatory=$false)]
    [string]$HtmlPolicyConfigPath = "cloudfront-config/cache-policy-html.json",
    
    [Parameter(Mandatory=$false)]
    [string]$AssetsPolicyConfigPath = "cloudfront-config/cache-policy-assets.json"
)

# AWS CLI v2 path (required for CloudFront cache policies)
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Color output functions
function Write-SuccessMsg {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-InfoMsg {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Main script
Write-InfoMsg "Starting CloudFront Cache Policies deployment..."
Write-InfoMsg "HTML Policy Config: $HtmlPolicyConfigPath"
Write-InfoMsg "Assets Policy Config: $AssetsPolicyConfigPath"

# Check if AWS CLI v2 is installed
if (-not (Test-Path $awsCmd)) {
    Write-ErrorMsg "AWS CLI v2 not found at: $awsCmd"
    Write-ErrorMsg "Please install AWS CLI v2 from: https://aws.amazon.com/cli/"
    exit 1
}

try {
    $awsVersion = & $awsCmd --version 2>&1
    Write-InfoMsg "AWS CLI found: $awsVersion"
    
    # Verify it's AWS CLI v2
    if ($awsVersion -notmatch "aws-cli/2\.") {
        Write-ErrorMsg "AWS CLI v2 is required for CloudFront cache policies"
        Write-ErrorMsg "Current version: $awsVersion"
        exit 1
    }
    Write-SuccessMsg "AWS CLI v2 verified"
} catch {
    Write-ErrorMsg "Failed to execute AWS CLI: $_"
    exit 1
}

# Check if config files exist
if (-not (Test-Path $HtmlPolicyConfigPath)) {
    Write-ErrorMsg "HTML policy config file not found: $HtmlPolicyConfigPath"
    exit 1
}
Write-SuccessMsg "HTML policy config file found"

if (-not (Test-Path $AssetsPolicyConfigPath)) {
    Write-ErrorMsg "Assets policy config file not found: $AssetsPolicyConfigPath"
    exit 1
}
Write-SuccessMsg "Assets policy config file found"

# Read policy configurations
try {
    $htmlPolicyConfig = Get-Content -Path $HtmlPolicyConfigPath -Raw | ConvertFrom-Json
    $htmlPolicyName = $htmlPolicyConfig.Name
    Write-SuccessMsg "HTML policy config loaded: $htmlPolicyName"
} catch {
    Write-ErrorMsg "Failed to read HTML policy config: $_"
    exit 1
}

try {
    $assetsPolicyConfig = Get-Content -Path $AssetsPolicyConfigPath -Raw | ConvertFrom-Json
    $assetsPolicyName = $assetsPolicyConfig.Name
    Write-SuccessMsg "Assets policy config loaded: $assetsPolicyName"
} catch {
    Write-ErrorMsg "Failed to read Assets policy config: $_"
    exit 1
}

# Function to create or update cache policy
function Deploy-CachePolicy {
    param(
        [string]$PolicyName,
        [string]$ConfigPath
    )
    
    Write-InfoMsg ""
    Write-InfoMsg "Processing cache policy: $PolicyName"
    Write-InfoMsg "----------------------------------------"
    
    # Check if policy already exists
    Write-InfoMsg "Checking if policy already exists..."
    $listResult = & $awsCmd cloudfront list-cache-policies --type custom --output json 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Failed to list cache policies: $listResult"
        return $null
    }
    
    $policies = $listResult | ConvertFrom-Json
    $existingPolicy = $policies.CachePolicyList.Items | Where-Object { $_.CachePolicy.CachePolicyConfig.Name -eq $PolicyName }
    
    if ($existingPolicy) {
        $policyId = $existingPolicy.CachePolicy.Id
        Write-InfoMsg "Policy already exists with ID: $policyId"
        Write-InfoMsg "Skipping creation (policy already configured)"
        Write-SuccessMsg "Using existing policy: $PolicyName"
        return $policyId
    }
    
    # Create new policy
    Write-InfoMsg "Policy does not exist. Creating new policy..."
    
    try {
        # Get absolute path for AWS CLI
        $absolutePath = (Resolve-Path $ConfigPath).Path
        
        $createResult = & $awsCmd cloudfront create-cache-policy `
            --cache-policy-config "file://$absolutePath" `
            --output json 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Failed to create policy: $createResult"
            return $null
        }
        
        $createJson = $createResult | ConvertFrom-Json
        $policyId = $createJson.CachePolicy.Id
        
        Write-SuccessMsg "Policy created successfully"
        Write-SuccessMsg "Policy ID: $policyId"
        
        return $policyId
        
    } catch {
        Write-ErrorMsg "Error during policy creation: $_"
        return $null
    }
}

# Deploy HTML cache policy
$htmlPolicyId = Deploy-CachePolicy -PolicyName $htmlPolicyName -ConfigPath $HtmlPolicyConfigPath

if (-not $htmlPolicyId) {
    Write-ErrorMsg "Failed to deploy HTML cache policy"
    exit 1
}

# Deploy Assets cache policy
$assetsPolicyId = Deploy-CachePolicy -PolicyName $assetsPolicyName -ConfigPath $AssetsPolicyConfigPath

if (-not $assetsPolicyId) {
    Write-ErrorMsg "Failed to deploy Assets cache policy"
    exit 1
}

# Output policy IDs to file for use in other scripts
Write-InfoMsg ""
Write-InfoMsg "Saving policy IDs to file..."

$policyIds = @{
    "HtmlPolicyId" = $htmlPolicyId
    "AssetsPolicyId" = $assetsPolicyId
    "HtmlPolicyName" = $htmlPolicyName
    "AssetsPolicyName" = $assetsPolicyName
}

$policyIds | ConvertTo-Json | Out-File -FilePath "cloudfront-cache-policy-ids.json" -Encoding UTF8
Write-SuccessMsg "Policy IDs saved to: cloudfront-cache-policy-ids.json"

# Display summary
Write-InfoMsg ""
Write-InfoMsg "========================================="
Write-InfoMsg "Cache Policies Deployment Summary"
Write-InfoMsg "========================================="
Write-SuccessMsg "HTML Policy:"
Write-InfoMsg "  Name: $htmlPolicyName"
Write-InfoMsg "  ID: $htmlPolicyId"
Write-InfoMsg ""
Write-SuccessMsg "Assets Policy:"
Write-InfoMsg "  Name: $assetsPolicyName"
Write-InfoMsg "  ID: $assetsPolicyId"
Write-InfoMsg ""
Write-SuccessMsg "Cache policies deployment completed successfully!"
Write-InfoMsg ""
Write-InfoMsg "Next steps:"
Write-InfoMsg "1. Update your CloudFront distribution to use these cache policies"
Write-InfoMsg "2. Use the IDs from cloudfront-cache-policy-ids.json"
Write-InfoMsg "3. Run the distribution update script to apply the policies"

exit 0
