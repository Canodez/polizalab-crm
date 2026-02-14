#!/bin/bash
set -e

# Load configuration
source "$(dirname "$0")/config.sh"

echo "=========================================="
echo "Setting up Static Web Deploy Infrastructure"
echo "=========================================="
echo ""
echo "Region: $AWS_REGION"
echo "Account ID: $AWS_ACCOUNT_ID"
echo "Frontend Bucket: $FRONTEND_BUCKET_NAME"
echo ""

# Step 1: Create S3 Bucket
echo "Step 1: Creating S3 bucket..."
if aws s3api head-bucket --bucket "$FRONTEND_BUCKET_NAME" 2>/dev/null; then
    echo "✓ Bucket already exists: $FRONTEND_BUCKET_NAME"
else
    aws s3api create-bucket \
        --bucket "$FRONTEND_BUCKET_NAME" \
        --region "$AWS_REGION"
    echo "✓ Bucket created: $FRONTEND_BUCKET_NAME"
fi

# Step 2: Enable versioning
echo ""
echo "Step 2: Enabling bucket versioning..."
aws s3api put-bucket-versioning \
    --bucket "$FRONTEND_BUCKET_NAME" \
    --versioning-configuration Status=Enabled
echo "✓ Versioning enabled"

# Step 3: Block public access
echo ""
echo "Step 3: Blocking public access..."
aws s3api put-public-access-block \
    --bucket "$FRONTEND_BUCKET_NAME" \
    --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "✓ Public access blocked"

# Step 4: Create Origin Access Control
echo ""
echo "Step 4: Creating Origin Access Control..."
OAC_OUTPUT=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config \
        Name="oac-${FRONTEND_BUCKET_NAME}",\
        Description="OAC for ${FRONTEND_BUCKET_NAME}",\
        SigningProtocol=sigv4,\
        SigningBehavior=always,\
        OriginAccessControlOriginType=s3 \
    --output json 2>/dev/null || echo "")

if [ -n "$OAC_OUTPUT" ]; then
    OAC_ID=$(echo "$OAC_OUTPUT" | jq -r '.OriginAccessControl.Id')
    echo "✓ OAC created: $OAC_ID"
else
    # Get existing OAC
    OAC_ID=$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='oac-${FRONTEND_BUCKET_NAME}'].Id" --output text)
    echo "✓ Using existing OAC: $OAC_ID"
fi

echo ""
echo "=========================================="
echo "Infrastructure setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Create CloudFront distribution (see deployment/cloudfront-config.json)"
echo "2. Update S3 bucket policy with distribution ID"
echo "3. Configure CodeBuild for CI/CD"
echo ""
echo "OAC ID: $OAC_ID"
echo "Save this for CloudFront configuration"
