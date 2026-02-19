# Profile Lambda Deployment Script
# This script packages and deploys the Profile Lambda function
# Requirements: 9.1

param(
    [Parameter(Mandatory=$false)]
    [string]$FunctionName = "ProfileHandler",
    
    [Parameter(Mandatory=$false)]
    [string]$LambdaCodePath = "lambda-deploy/profile_handler.py",
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east-1"
)

# AWS CLI v2 path
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
Write-InfoMsg "Starting Profile Lambda deployment..."
Write-InfoMsg "Function Name: $FunctionName"
Write-InfoMsg "Lambda Code: $LambdaCodePath"
Write-InfoMsg "Region: $Region"

# Check if AWS CLI v2 is installed
if (-not (Test-Path $awsCmd)) {
    Write-ErrorMsg "AWS CLI v2 not found at: $awsCmd"
    Write-ErrorMsg "Please install AWS CLI v2 from: https://aws.amazon.com/cli/"
    exit 1
}

try {
    $awsVersion = & $awsCmd --version 2>&1
    Write-InfoMsg "AWS CLI found: $awsVersion"
    Write-SuccessMsg "AWS CLI v2 verified"
} catch {
    Write-ErrorMsg "Failed to execute AWS CLI: $_"
    exit 1
}

# Check if lambda code file exists
if (-not (Test-Path $LambdaCodePath)) {
    Write-ErrorMsg "Lambda code file not found: $LambdaCodePath"
    exit 1
}
Write-SuccessMsg "Lambda code file found"

# Create temporary directory for packaging
$tempDir = "lambda-deploy-temp"
if (Test-Path $tempDir) {
    Write-InfoMsg "Removing existing temporary directory..."
    Remove-Item -Path $tempDir -Recurse -Force
}

Write-InfoMsg "Creating temporary directory for packaging..."
New-Item -ItemType Directory -Path $tempDir | Out-Null
Write-SuccessMsg "Temporary directory created"

# Copy lambda code to temp directory
try {
    Write-InfoMsg "Copying lambda code to temporary directory..."
    Copy-Item -Path $LambdaCodePath -Destination "$tempDir/profile_handler.py"
    Write-SuccessMsg "Lambda code copied"
} catch {
    Write-ErrorMsg "Failed to copy lambda code: $_"
    Remove-Item -Path $tempDir -Recurse -Force
    exit 1
}

# Create deployment package (zip file)
$zipFile = "profile-lambda-deployment.zip"
if (Test-Path $zipFile) {
    Write-InfoMsg "Removing existing deployment package..."
    Remove-Item -Path $zipFile -Force
}

Write-InfoMsg "Creating deployment package..."
try {
    # Use PowerShell's Compress-Archive
    Compress-Archive -Path "$tempDir/*" -DestinationPath $zipFile -Force
    Write-SuccessMsg "Deployment package created: $zipFile"
} catch {
    Write-ErrorMsg "Failed to create deployment package: $_"
    Remove-Item -Path $tempDir -Recurse -Force
    exit 1
}

# Clean up temporary directory
Write-InfoMsg "Cleaning up temporary directory..."
Remove-Item -Path $tempDir -Recurse -Force
Write-SuccessMsg "Temporary directory removed"

# Check if Lambda function exists
Write-InfoMsg "Checking if Lambda function exists..."
$functionExists = & $awsCmd lambda get-function --function-name $FunctionName --region $Region 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-InfoMsg "Lambda function exists. Updating function code..."
    
    # Update Lambda function code
    try {
        $updateResult = & $awsCmd lambda update-function-code `
            --function-name $FunctionName `
            --zip-file "fileb://$zipFile" `
            --region $Region `
            --output json 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Failed to update Lambda function code: $updateResult"
            Remove-Item -Path $zipFile -Force
            exit 1
        }
        
        Write-SuccessMsg "Lambda function code updated successfully"
        
        # Wait for update to complete
        Write-InfoMsg "Waiting for Lambda function update to complete..."
        $maxAttempts = 30
        $attempt = 0
        $updateComplete = $false
        
        while ($attempt -lt $maxAttempts -and -not $updateComplete) {
            Start-Sleep -Seconds 2
            $attempt++
            
            $functionStatus = & $awsCmd lambda get-function `
                --function-name $FunctionName `
                --region $Region `
                --output json 2>&1 | ConvertFrom-Json
            
            $state = $functionStatus.Configuration.State
            $lastUpdateStatus = $functionStatus.Configuration.LastUpdateStatus
            
            Write-InfoMsg "Attempt $attempt/$maxAttempts - State: $state, LastUpdateStatus: $lastUpdateStatus"
            
            if ($state -eq "Active" -and $lastUpdateStatus -eq "Successful") {
                $updateComplete = $true
                Write-SuccessMsg "Lambda function update completed successfully"
            } elseif ($lastUpdateStatus -eq "Failed") {
                Write-ErrorMsg "Lambda function update failed"
                Remove-Item -Path $zipFile -Force
                exit 1
            }
        }
        
        if (-not $updateComplete) {
            Write-ErrorMsg "Lambda function update timed out after $maxAttempts attempts"
            Remove-Item -Path $zipFile -Force
            exit 1
        }
        
        # Get function ARN
        $functionArn = $functionStatus.Configuration.FunctionArn
        Write-SuccessMsg "Function ARN: $functionArn"
        
    } catch {
        Write-ErrorMsg "Error during Lambda function update: $_"
        Remove-Item -Path $zipFile -Force
        exit 1
    }
    
} else {
    Write-ErrorMsg "Lambda function '$FunctionName' does not exist in region '$Region'"
    Write-ErrorMsg "Please create the Lambda function first using the AWS Console or CloudFormation"
    Write-InfoMsg "The function should be created with:"
    Write-InfoMsg "  - Runtime: Python 3.x"
    Write-InfoMsg "  - Handler: profile_handler.lambda_handler"
    Write-InfoMsg "  - Environment variables: DYNAMODB_USERS_TABLE, S3_BUCKET_NAME"
    Write-InfoMsg "  - IAM role with DynamoDB and S3 permissions"
    Remove-Item -Path $zipFile -Force
    exit 1
}

# Clean up deployment package
Write-InfoMsg "Cleaning up deployment package..."
Remove-Item -Path $zipFile -Force
Write-SuccessMsg "Deployment package removed"

Write-SuccessMsg "Profile Lambda deployment completed successfully!"
Write-InfoMsg ""
Write-InfoMsg "Next steps:"
Write-InfoMsg "1. Test the Lambda function with a GET request to /profile"
Write-InfoMsg "2. Verify that non-existent profiles are created automatically"
Write-InfoMsg "3. Check CloudWatch Logs for any errors"

exit 0
