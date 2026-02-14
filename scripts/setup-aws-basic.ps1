# PolizaLab MVP - AWS Basic Infrastructure Setup
# Creates Cognito, DynamoDB, and S3 resources

$ErrorActionPreference = "Continue"

# Configuration
$AWS_REGION = "us-east-1"
$BUCKET_NAME = "polizalab-documents-dev"

Write-Host "========================================" -ForegroundColor Blue
Write-Host "PolizaLab MVP - AWS Setup" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Check AWS CLI
try {
    $null = aws --version
    Write-Host "[OK] AWS CLI instalado" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] AWS CLI no está instalado" -ForegroundColor Red
    Write-Host "Instala desde: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Check credentials
try {
    $AWS_ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
    Write-Host "[OK] AWS Account ID: $AWS_ACCOUNT_ID" -ForegroundColor Green
    Write-Host "[OK] Region: $AWS_REGION" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Credenciales AWS no configuradas" -ForegroundColor Red
    Write-Host "Ejecuta: aws configure" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
$confirmation = Read-Host "¿Continuar con la configuración? (s/n)"
if ($confirmation -ne 's' -and $confirmation -ne 'S') {
    Write-Host "Cancelado" -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# ============================================
# 1. Cognito User Pool
# ============================================
Write-Host "[1/3] Creando Cognito User Pool..." -ForegroundColor Cyan

$poolJson = aws cognito-idp list-user-pools --max-results 60 --region $AWS_REGION 2>$null
if ($poolJson) {
    $pools = $poolJson | ConvertFrom-Json
    $existingPool = $pools.UserPools | Where-Object { $_.Name -eq "polizalab-users" }
    
    if ($existingPool) {
        $USER_POOL_ID = $existingPool.Id
        Write-Host "[OK] User Pool ya existe: $USER_POOL_ID" -ForegroundColor Yellow
    }
}

if (-not $USER_POOL_ID) {
    Write-Host "Creando nuevo User Pool..." -ForegroundColor Gray
    Write-Host "NOTA: Debes crear el User Pool manualmente en la consola AWS" -ForegroundColor Yellow
    Write-Host "Sigue la guía en: docs/aws-infrastructure-setup.md" -ForegroundColor Yellow
    Write-Host ""
    $USER_POOL_ID = Read-Host "Ingresa el User Pool ID (us-east-1_XXXXXXXXX)"
}

if ($USER_POOL_ID) {
    # Get or create app client
    $clientsJson = aws cognito-idp list-user-pool-clients --user-pool-id $USER_POOL_ID --region $AWS_REGION 2>$null
    if ($clientsJson) {
        $clients = $clientsJson | ConvertFrom-Json
        $existingClient = $clients.UserPoolClients | Where-Object { $_.ClientName -eq "polizalab-web-client" }
        
        if ($existingClient) {
            $APP_CLIENT_ID = $existingClient.ClientId
            Write-Host "[OK] App Client ya existe: $APP_CLIENT_ID" -ForegroundColor Yellow
        }
    }
    
    if (-not $APP_CLIENT_ID) {
        Write-Host "Debes crear el App Client manualmente" -ForegroundColor Yellow
        $APP_CLIENT_ID = Read-Host "Ingresa el App Client ID"
    }
}

Write-Host ""

# ============================================
# 2. DynamoDB Tables
# ============================================
Write-Host "[2/3] Creando tablas DynamoDB..." -ForegroundColor Cyan

# Users table
Write-Host "Creando tabla Users..." -ForegroundColor Gray
aws dynamodb create-table `
    --table-name Users `
    --attribute-definitions AttributeName=userId,AttributeType=S `
    --key-schema AttributeName=userId,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST `
    --region $AWS_REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Tabla Users creada" -ForegroundColor Green
} else {
    Write-Host "[OK] Tabla Users ya existe" -ForegroundColor Yellow
}

# Policies table
Write-Host "Creando tabla Policies..." -ForegroundColor Gray
aws dynamodb create-table `
    --table-name Policies `
    --attribute-definitions AttributeName=policyId,AttributeType=S AttributeName=userId,AttributeType=S AttributeName=createdAt,AttributeType=S `
    --key-schema AttributeName=policyId,KeyType=HASH `
    --global-secondary-indexes IndexName=userId-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL} `
    --billing-mode PAY_PER_REQUEST `
    --region $AWS_REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Tabla Policies creada" -ForegroundColor Green
} else {
    Write-Host "[OK] Tabla Policies ya existe" -ForegroundColor Yellow
}

Write-Host "Esperando que las tablas estén activas..." -ForegroundColor Gray
aws dynamodb wait table-exists --table-name Users --region $AWS_REGION 2>$null
aws dynamodb wait table-exists --table-name Policies --region $AWS_REGION 2>$null
Write-Host "[OK] Tablas activas" -ForegroundColor Green

Write-Host ""

# ============================================
# 3. S3 Bucket
# ============================================
Write-Host "[3/3] Creando bucket S3..." -ForegroundColor Cyan

aws s3api create-bucket --bucket $BUCKET_NAME --region $AWS_REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Bucket creado: $BUCKET_NAME" -ForegroundColor Green
} else {
    Write-Host "[OK] Bucket ya existe: $BUCKET_NAME" -ForegroundColor Yellow
}

# Encryption
Write-Host "Configurando encriptación..." -ForegroundColor Gray
$encryptionConfig = '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-encryption --bucket $BUCKET_NAME --server-side-encryption-configuration $encryptionConfig 2>$null | Out-Null

# Block public access
Write-Host "Bloqueando acceso público..." -ForegroundColor Gray
aws s3api put-public-access-block --bucket $BUCKET_NAME --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true 2>$null | Out-Null

# CORS
Write-Host "Configurando CORS..." -ForegroundColor Gray
$corsConfig = @'
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["http://localhost:3000"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}
'@

$corsFile = "$env:TEMP\cors-config.json"
$corsConfig | Out-File -FilePath $corsFile -Encoding utf8
aws s3api put-bucket-cors --bucket $BUCKET_NAME --cors-configuration "file://$corsFile" 2>$null | Out-Null
Remove-Item $corsFile -ErrorAction SilentlyContinue

Write-Host "[OK] Bucket configurado" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "Configuración Completada!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

if ($USER_POOL_ID -and $APP_CLIENT_ID) {
    Write-Host "Variables de Entorno:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USER_POOL_ID"
    Write-Host "NEXT_PUBLIC_COGNITO_CLIENT_ID=$APP_CLIENT_ID"
    Write-Host "NEXT_PUBLIC_COGNITO_REGION=$AWS_REGION"
    Write-Host "NEXT_PUBLIC_S3_BUCKET_NAME=$BUCKET_NAME"
    Write-Host "NEXT_PUBLIC_AWS_REGION=$AWS_REGION"
    Write-Host ""
    Write-Host "Copia estas variables a tu archivo .env.local" -ForegroundColor Cyan
} else {
    Write-Host "IMPORTANTE: Completa la configuración de Cognito" -ForegroundColor Yellow
    Write-Host "Sigue la guía en: docs/aws-infrastructure-setup.md" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Yellow
Write-Host "1. Crear roles IAM para Lambda" -ForegroundColor White
Write-Host "2. Crear y desplegar funciones Lambda" -ForegroundColor White
Write-Host "3. Crear API Gateway" -ForegroundColor White
Write-Host ""
Write-Host "Consulta: scripts/README.md para más detalles" -ForegroundColor Cyan
