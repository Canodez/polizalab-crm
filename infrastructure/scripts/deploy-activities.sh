#!/usr/bin/env bash
# =============================================================================
# deploy-activities.sh — PolizaLab CRM | Activities feature deployment
#
# Usage:
#   ./deploy-activities.sh [--env dev|stage|prod] [--region us-east-1]
#
# What this script does:
#   1. Creates/updates the Activities DynamoDB table via CloudFormation
#   2. Creates/updates the IAM role + inline policy via CloudFormation
#   3. Packages and deploys the activity-handler Lambda function
#   4. Creates or updates API Gateway routes + integrations
#   5. Sets reserved concurrency on the Lambda
#   6. Rolls back CloudFormation stacks on any failure
#
# Prerequisites:
#   - AWS CLI v2 configured with appropriate credentials
#   - jq installed (brew install jq / apt install jq)
#   - Python 3.12 + pip available locally for packaging
#   - Lambda source code at: lambda/activity-handler/handler.py
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENV="dev"
REGION="us-east-1"
ACCOUNT_ID="584876396768"
API_ID="f34orvshp5"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"
LAMBDA_SRC_DIR="${PROJECT_ROOT}/lambda/activity-handler"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)    ENV="$2";    shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ ! "$ENV" =~ ^(dev|stage|prod)$ ]]; then
  echo "ERROR: --env must be dev, stage, or prod (got: $ENV)"
  exit 1
fi

# ---------------------------------------------------------------------------
# Derived names
# ---------------------------------------------------------------------------
FUNCTION_NAME="polizalab-activity-handler-${ENV}"
DYNAMO_STACK="polizalab-activities-table-${ENV}"
IAM_STACK="polizalab-activity-handler-role-${ENV}"
ARTIFACTS_BUCKET="polizalab-lambda-artifacts-${ENV}"
ARTIFACTS_KEY="activity-handler/${FUNCTION_NAME}.zip"
ACTIVITIES_TABLE_NAME="Activities-${ENV}"
SYSTEM_TABLE_NAME="ActivityTypesSystem-${ENV}"
ROLE_NAME="polizalab-activity-handler-role-${ENV}"

DYNAMO_CF="${INFRA_DIR}/dynamodb/activities-table.json"
IAM_CF="${INFRA_DIR}/iam/activity-handler-policy.json"

TAG_LIST="Project=PolizaLab Feature=Activities Environment=${ENV}"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date -u +%H:%M:%SZ)] $*"; }
ok()   { echo "[$(date -u +%H:%M:%SZ)] OK  $*"; }
fail() { echo "[$(date -u +%H:%M:%SZ)] ERR $*" >&2; }

# ---------------------------------------------------------------------------
# Rollback registry — stacks deployed during this run that must be torn down
# ---------------------------------------------------------------------------
DEPLOYED_STACKS=()

rollback() {
  local exit_code=$?
  if [[ ${#DEPLOYED_STACKS[@]} -eq 0 ]]; then
    fail "Deployment failed (no stacks to roll back)."
    exit $exit_code
  fi

  fail "Deployment failed. Rolling back ${#DEPLOYED_STACKS[@]} stack(s)..."
  for stack in "${DEPLOYED_STACKS[@]}"; do
    fail "  Rolling back CloudFormation stack: $stack"
    aws cloudformation delete-stack \
      --stack-name "$stack" \
      --region "$REGION" || true
    aws cloudformation wait stack-delete-complete \
      --stack-name "$stack" \
      --region "$REGION" 2>/dev/null || true
    fail "  Rolled back: $stack"
  done

  fail "Rollback complete. Lambda and API Gateway changes are NOT automatically reversed."
  fail "To fully undo, delete the Lambda function and API Gateway integrations manually."
  exit $exit_code
}

trap rollback ERR

# ---------------------------------------------------------------------------
# Helper: deploy a CloudFormation stack (create-or-update)
# ---------------------------------------------------------------------------
deploy_cfn_stack() {
  local stack_name="$1"
  local template_file="$2"
  shift 2
  local extra_params=("$@")

  log "Deploying CloudFormation stack: $stack_name"

  local change_type
  if aws cloudformation describe-stacks \
       --stack-name "$stack_name" \
       --region "$REGION" \
       --output text \
       --query "Stacks[0].StackStatus" 2>/dev/null | grep -qv "DELETE_COMPLETE"; then
    change_type="update"
  else
    change_type="create"
    DEPLOYED_STACKS+=("$stack_name")
  fi

  local param_overrides=("Environment=${ENV}")
  if [[ ${#extra_params[@]} -gt 0 ]]; then
    param_overrides+=("${extra_params[@]}")
  fi

  aws cloudformation deploy \
    --stack-name "$stack_name" \
    --template-file "$template_file" \
    --parameter-overrides "${param_overrides[@]}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" \
    --tags $TAG_LIST \
    --no-fail-on-empty-changeset

  ok "CloudFormation stack ${change_type}d: $stack_name"
}

# ---------------------------------------------------------------------------
# Helper: ensure artifacts S3 bucket exists
# ---------------------------------------------------------------------------
ensure_artifacts_bucket() {
  log "Checking artifacts bucket: $ARTIFACTS_BUCKET"
  if aws s3api head-bucket --bucket "$ARTIFACTS_BUCKET" --region "$REGION" 2>/dev/null; then
    ok "Artifacts bucket already exists"
    return 0
  fi

  log "Creating artifacts bucket: $ARTIFACTS_BUCKET"
  aws s3api create-bucket \
    --bucket "$ARTIFACTS_BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null \
    || aws s3api create-bucket \
         --bucket "$ARTIFACTS_BUCKET" \
         --region "$REGION"

  aws s3api put-bucket-versioning \
    --bucket "$ARTIFACTS_BUCKET" \
    --versioning-configuration Status=Enabled \
    --region "$REGION"

  aws s3api put-public-access-block \
    --bucket "$ARTIFACTS_BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
    --region "$REGION"

  ok "Artifacts bucket created and hardened: $ARTIFACTS_BUCKET"
}

# ---------------------------------------------------------------------------
# Helper: package Lambda
# ---------------------------------------------------------------------------
package_lambda() {
  local build_dir
  build_dir="$(mktemp -d)"
  LAMBDA_ZIP_PATH="${build_dir}/${FUNCTION_NAME}.zip"

  log "Packaging Lambda from: $LAMBDA_SRC_DIR"

  if [[ ! -f "${LAMBDA_SRC_DIR}/handler.py" ]]; then
    fail "handler.py not found at ${LAMBDA_SRC_DIR}/handler.py"
    exit 1
  fi

  # Install dependencies into the build directory
  if [[ -f "${LAMBDA_SRC_DIR}/requirements.txt" ]]; then
    log "Installing Python dependencies..."
    python3 -m pip install \
      --quiet \
      --target "${build_dir}/package" \
      --platform manylinux2014_x86_64 \
      --implementation cp \
      --python-version 3.12 \
      --only-binary=:all: \
      -r "${LAMBDA_SRC_DIR}/requirements.txt"
    cp -r "${build_dir}/package/." "${build_dir}/"
    rm -rf "${build_dir}/package"
  fi

  # Copy source files (exclude tests, __pycache__, .pyc)
  rsync -a \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'tests/' \
    --exclude '.pytest_cache/' \
    "${LAMBDA_SRC_DIR}/" "${build_dir}/"

  # Create zip
  (cd "${build_dir}" && zip -q -r "$LAMBDA_ZIP_PATH" .)

  ok "Lambda packaged: $LAMBDA_ZIP_PATH"
}

# ---------------------------------------------------------------------------
# Helper: upload Lambda zip to S3
# ---------------------------------------------------------------------------
upload_lambda_zip() {
  local zip_path="$1"

  log "Uploading Lambda package to s3://${ARTIFACTS_BUCKET}/${ARTIFACTS_KEY}"

  aws s3 cp "$zip_path" "s3://${ARTIFACTS_BUCKET}/${ARTIFACTS_KEY}" \
    --region "$REGION" \
    --metadata "Environment=${ENV},Feature=Activities,Project=PolizaLab"

  ok "Lambda package uploaded"
  rm -rf "$(dirname "$zip_path")"
}

# ---------------------------------------------------------------------------
# Helper: create or update Lambda function
# ---------------------------------------------------------------------------
deploy_lambda() {
  local role_arn
  role_arn=$(aws cloudformation describe-stacks \
    --stack-name "$IAM_STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" \
    --output text)

  if [[ -z "$role_arn" ]]; then
    fail "Could not retrieve RoleArn from stack $IAM_STACK"
    exit 1
  fi

  log "Deploying Lambda function: $FUNCTION_NAME"
  log "  Role ARN: $role_arn"

  local existing_function
  existing_function=$(aws lambda get-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query "Configuration.FunctionName" \
    --output text 2>/dev/null || echo "")

  if [[ -z "$existing_function" ]]; then
    log "Creating new Lambda function..."
    aws lambda create-function \
      --function-name "$FUNCTION_NAME" \
      --runtime python3.12 \
      --handler handler.handler \
      --role "$role_arn" \
      --code "S3Bucket=${ARTIFACTS_BUCKET},S3Key=${ARTIFACTS_KEY}" \
      --memory-size 256 \
      --timeout 30 \
      --tracing-config Mode=Active \
      --description "PolizaLab Activities CRUD handler (${ENV})" \
      --environment "Variables={ACTIVITIES_TABLE=${ACTIVITIES_TABLE_NAME},SYSTEM_TABLE=${SYSTEM_TABLE_NAME},TENANT_ID=default,ALLOWED_ORIGIN=https://crm.antesdefirmar.org,LOG_LEVEL=INFO}" \
      --tags "Project=PolizaLab,Feature=Activities,Environment=${ENV}" \
      --region "$REGION"

    log "Waiting for Lambda function to become active..."
    aws lambda wait function-active \
      --function-name "$FUNCTION_NAME" \
      --region "$REGION"

    ok "Lambda function created: $FUNCTION_NAME"
  else
    log "Updating existing Lambda function code..."
    aws lambda update-function-code \
      --function-name "$FUNCTION_NAME" \
      --s3-bucket "$ARTIFACTS_BUCKET" \
      --s3-key "$ARTIFACTS_KEY" \
      --region "$REGION" \
      --output text > /dev/null

    log "Waiting for code update to complete..."
    aws lambda wait function-updated \
      --function-name "$FUNCTION_NAME" \
      --region "$REGION"

    log "Updating Lambda function configuration..."
    aws lambda update-function-configuration \
      --function-name "$FUNCTION_NAME" \
      --runtime python3.12 \
      --handler handler.handler \
      --role "$role_arn" \
      --memory-size 256 \
      --timeout 30 \
      --tracing-config Mode=Active \
      --environment "Variables={ACTIVITIES_TABLE=${ACTIVITIES_TABLE_NAME},SYSTEM_TABLE=${SYSTEM_TABLE_NAME},TENANT_ID=default,ALLOWED_ORIGIN=https://crm.antesdefirmar.org,LOG_LEVEL=INFO}" \
      --region "$REGION" \
      --output text > /dev/null

    log "Waiting for configuration update to complete..."
    aws lambda wait function-updated \
      --function-name "$FUNCTION_NAME" \
      --region "$REGION"

    ok "Lambda function updated: $FUNCTION_NAME"
  fi

  # Set reserved concurrency
  log "Setting reserved concurrency to 50..."
  aws lambda put-function-concurrency \
    --function-name "$FUNCTION_NAME" \
    --reserved-concurrent-executions 50 \
    --region "$REGION" \
    --output text > /dev/null
  ok "Reserved concurrency set"
}

# ---------------------------------------------------------------------------
# Helper: create/update a single API Gateway route + integration
# ---------------------------------------------------------------------------
upsert_api_route() {
  local route_key="$1"       # e.g.  "GET /activities"
  local operation_name="$2"  # e.g.  "ListActivities"
  local authorizer_id="$3"

  local function_arn
  function_arn=$(aws lambda get-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query "Configuration.FunctionArn" \
    --output text)

  local integration_uri
  integration_uri="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${function_arn}/invocations"

  # Check if integration already exists for this function
  local integration_id
  integration_id=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?IntegrationUri=='${integration_uri}'].IntegrationId | [0]" \
    --output text 2>/dev/null || echo "")

  if [[ -z "$integration_id" || "$integration_id" == "None" ]]; then
    log "  Creating integration for $FUNCTION_NAME..."
    integration_id=$(aws apigatewayv2 create-integration \
      --api-id "$API_ID" \
      --integration-type AWS_PROXY \
      --integration-uri "$integration_uri" \
      --payload-format-version 2.0 \
      --timeout-in-millis 30000 \
      --description "activity-handler Lambda proxy (${ENV})" \
      --region "$REGION" \
      --query "IntegrationId" \
      --output text)
    ok "  Integration created: $integration_id"

    # Grant API Gateway permission to invoke the Lambda
    local statement_id="apigw-${API_ID}-${ENV}-invoke"
    aws lambda add-permission \
      --function-name "$FUNCTION_NAME" \
      --statement-id "$statement_id" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
      --region "$REGION" 2>/dev/null \
      || log "  Lambda invoke permission already exists (skipping)"
  fi

  # Check if this route already exists
  local existing_route_id
  existing_route_id=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?RouteKey=='${route_key}'].RouteId | [0]" \
    --output text 2>/dev/null || echo "")

  # Trim whitespace and handle multi-line "None" responses
  existing_route_id=$(echo "$existing_route_id" | head -1 | xargs)

  if [[ -z "$existing_route_id" || "$existing_route_id" == "None" ]]; then
    log "  Creating route: $route_key"
    aws apigatewayv2 create-route \
      --api-id "$API_ID" \
      --route-key "$route_key" \
      --authorization-type JWT \
      --authorizer-id "$authorizer_id" \
      --operation-name "$operation_name" \
      --target "integrations/${integration_id}" \
      --region "$REGION" \
      --output text > /dev/null
    ok "  Route created: $route_key"
  else
    log "  Updating route: $route_key (id: $existing_route_id)"
    aws apigatewayv2 update-route \
      --api-id "$API_ID" \
      --route-id "$existing_route_id" \
      --authorization-type JWT \
      --authorizer-id "$authorizer_id" \
      --operation-name "$operation_name" \
      --target "integrations/${integration_id}" \
      --region "$REGION" \
      --output text > /dev/null
    ok "  Route updated: $route_key"
  fi
}

# ---------------------------------------------------------------------------
# Helper: wire up all API Gateway routes
# ---------------------------------------------------------------------------
deploy_api_routes() {
  log "Discovering Cognito JWT authorizer on API $API_ID..."

  local authorizer_id
  authorizer_id=$(aws apigatewayv2 get-authorizers \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?AuthorizerType=='JWT'].AuthorizerId | [0]" \
    --output text)

  if [[ -z "$authorizer_id" || "$authorizer_id" == "None" ]]; then
    fail "No JWT authorizer found on API $API_ID. Ensure Cognito authorizer is configured first."
    exit 1
  fi

  ok "Found JWT authorizer: $authorizer_id"

  log "Creating/updating API Gateway routes..."

  upsert_api_route "GET /activities"                                      "ListActivities"        "$authorizer_id"
  upsert_api_route "GET /activities/today"                                "GetTodayActivities"    "$authorizer_id"
  upsert_api_route "GET /activities/{activityId}"                         "GetActivity"           "$authorizer_id"
  upsert_api_route "POST /activities"                                     "CreateActivity"        "$authorizer_id"
  upsert_api_route "PATCH /activities/{activityId}"                       "UpdateActivity"        "$authorizer_id"
  upsert_api_route "POST /activities/{activityId}/complete"               "CompleteActivity"      "$authorizer_id"
  upsert_api_route "POST /activities/{activityId}/cancel"                 "CancelActivity"        "$authorizer_id"
  upsert_api_route "POST /activities/{activityId}/reschedule"             "RescheduleActivity"    "$authorizer_id"
  upsert_api_route "DELETE /activities/{activityId}"                      "DeleteActivity"        "$authorizer_id"
  upsert_api_route "GET /activities/by-entity/{entityType}/{entityId}"    "GetActivitiesByEntity" "$authorizer_id"

  ok "All API Gateway routes deployed"

  # Deploy the default stage so routes are live
  log "Deploying API Gateway stage (auto-deploy)..."
  aws apigatewayv2 create-deployment \
    --api-id "$API_ID" \
    --stage-name '$default' \
    --description "Activities feature deployment - $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --region "$REGION" \
    --output text > /dev/null
  ok "API Gateway deployment triggered"
}

# ===========================================================================
# MAIN
# ===========================================================================
log "======================================================"
log "  PolizaLab CRM — Activities Feature Deployment"
log "  Environment : $ENV"
log "  Region      : $REGION"
log "  Account     : $ACCOUNT_ID"
log "  API Gateway : $API_ID"
log "  Lambda      : $FUNCTION_NAME"
log "  DynamoDB    : $ACTIVITIES_TABLE_NAME"
log "======================================================"

# Step 1 — DynamoDB table
log ""
log "STEP 1/5: DynamoDB table"
deploy_cfn_stack "$DYNAMO_STACK" "$DYNAMO_CF"

# Step 2 — IAM role + policy
log ""
log "STEP 2/5: IAM role + policy"
deploy_cfn_stack "$IAM_STACK" "$IAM_CF"

# Step 3 — Artifacts bucket + package + upload
log ""
log "STEP 3/5: Package and upload Lambda"
ensure_artifacts_bucket
LAMBDA_ZIP_PATH=""
package_lambda
upload_lambda_zip "$LAMBDA_ZIP_PATH"

# Step 4 — Lambda function
log ""
log "STEP 4/5: Lambda function"
deploy_lambda

# Step 5 — API Gateway routes
log ""
log "STEP 5/5: API Gateway routes"
deploy_api_routes

# Done
log ""
log "======================================================"
log "  Deployment complete!"
log ""
log "  DynamoDB stack  : $DYNAMO_STACK"
log "  IAM stack       : $IAM_STACK"
log "  Lambda function : $FUNCTION_NAME"
log "  API ID          : $API_ID"
log ""
log "  Endpoint base:"
log "    https://${API_ID}.execute-api.${REGION}.amazonaws.com/activities"
log "======================================================"
