# AWS Configuration
$AWS_REGION = "us-east-1"
$AWS_ACCOUNT_ID = "584876396768"
$FRONTEND_BUCKET_NAME = "polizalab-crm-frontend"

Write-Host "==========================================" -ForegroundColor Blue
Write-Host "Setting up Static Web Deploy Infrastructure" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Region: $AWS_REGION"
Write-Host "Account ID: $AWS_ACCOUNT_ID"
Write-Host "Frontend Bucket: $FRONTEND_BUCKET_NAME"
Write-Host ""

# Step 1: Create S3 Bucket
Write-Host "Step 1: Creating S3 bucket..." -ForegroundColor Yellow
$bucketExists = aws s3api head-bucket --bucket $FRONTEND_BUCKET_NAME 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Bucket already exists: $FRONTEND_BUCKET_NAME" -ForegroundColor Green
} else {
    aws s3api create-bucket --bucket $FRONTEND_BUCKET_NAME --region $AWS_REGION
    Write-Host "✓ Bucket created: $FRONTEND_BUCKET_NAME" -ForegroundColor Green
}

# Step 2: Enable versioning
Write-Host ""
Write-Host "Step 2: Enabling bucket versioning..." -ForegroundColor Yellow
aws s3api put-bucket-versioning `
    --bucket $FRONTEND_BUCKET_NAME `
    --versioning-configuration Status=Enabled
Write-Host "✓ Versioning enabled" -ForegroundColor Green

# Step 3: Block public access
Write-Host ""
Write-Host "Step 3: Blocking public access..." -ForegroundColor Yellow
aws s3api put-public-access-block `
    --bucket $FRONTEND_BUCKET_NAME `
    --public-access-block-configuration `
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
Write-Host "✓ Public access blocked" -ForegroundColor Green

# Step 4: Create Origin Access Control
Write-Host ""
Write-Host "Step 4: Creating Origin Access Control..." -ForegroundColor Yellow

$oacName = "oac-$FRONTEND_BUCKET_NAME"
$oacJson = @"
{
    "Name": "$oacName",
    "Description": "OAC for $FRONTEND_BUCKET_NAME",
    "SigningProtocol": "sigv4",
    "SigningBehavior": "always",
    "OriginAccessControlOriginType": "s3"
}
"@

$oacOutput = aws cloudfront create-origin-access-control --origin-access-control-config $oacJson --output json 2>$null
if ($LASTEXITCODE -eq 0) {
    $oacData = $oacOutput | ConvertFrom-Json
    $OAC_ID = $oacData.OriginAccessControl.Id
    Write-Host "✓ OAC created: $OAC_ID" -ForegroundColor Green
} else {
    $OAC_ID = aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='$oacName'].Id" --output text
    Write-Host "✓ Using existing OAC: $OAC_ID" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Blue
Write-Host "Infrastructure setup complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create CloudFront distribution using AWS Console or CLI"
Write-Host "2. Update S3 bucket policy with distribution ID"
Write-Host "3. Configure CodeBuild for CI/CD"
Write-Host ""
Write-Host "OAC ID: $OAC_ID" -ForegroundColor Cyan
Write-Host "Save this for CloudFront configuration"
