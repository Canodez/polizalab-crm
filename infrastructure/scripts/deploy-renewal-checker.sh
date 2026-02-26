#!/usr/bin/env bash
# =============================================================================
# deploy-renewal-checker.sh — PolizaLab CRM | Renewal Checker deployment
#
# Usage:
#   ./deploy-renewal-checker.sh [--env dev|stage|prod] [--region us-east-1]
#
# What this script does:
#   1. Creates/updates the IAM role + inline policy via CloudFormation
#   2. Packages and deploys the renewal-checker Lambda function
#   3. Creates/updates CloudWatch Events rule (rate 1 day) to trigger Lambda
#   4. Sets reserved concurrency on the Lambda
#
# Prerequisites:
#   - AWS CLI v2 configured with appropriate credentials
#   - jq installed (brew install jq / apt install jq)
#   - Python 3.12 + pip available locally for packaging
#   - Lambda source code at: lambda/renewal-checker/handler.py
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENV="dev"
REGION="us-east-1"
ACCOUNT_ID="584876396768"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"
LAMBDA_SRC_DIR="${PROJECT_ROOT}/lambda/renewal-checker"

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
FUNCTION_NAME="polizalab-renewal-checker-${ENV}"
IAM_STACK="polizalab-renewal-checker-role-${ENV}"
ARTIFACTS_BUCKET="polizalab-lambda-artifacts-${ENV}"
ARTIFACTS_KEY="renewal-checker/${FUNCTION_NAME}.zip"
POLICIES_TABLE_NAME="Policies-${ENV}"
ACTIVITIES_TABLE_NAME="Activities-${ENV}"
ROLE_NAME="polizalab-renewal-checker-role-${ENV}"
RULE_NAME="polizalab-renewal-checker-daily-${ENV}"

IAM_CF="${INFRA_DIR}/iam/renewal-checker-policy.json"

TAG_LIST="Project=PolizaLab Feature=Renewals Environment=${ENV}"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date -u +%H:%M:%SZ)] $*"; }
ok()   { echo "[$(date -u +%H:%M:%SZ)] OK  $*"; }
fail() { echo "[$(date -u +%H:%M:%SZ)] ERR $*" >&2; }

# ---------------------------------------------------------------------------
# Rollback registry
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

  fail "Rollback complete. Lambda and EventBridge changes are NOT automatically reversed."
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

  # Copy shared module (auto_activity)
  local shared_dir="${PROJECT_ROOT}/lambda/shared"
  if [[ -d "$shared_dir" ]]; then
    log "Including shared module..."
    mkdir -p "${build_dir}/shared"
    rsync -a \
      --exclude '__pycache__' \
      --exclude '*.pyc' \
      "${shared_dir}/" "${build_dir}/shared/"
  fi

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
    --metadata "Environment=${ENV},Feature=Renewals,Project=PolizaLab"

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

  local env_vars="Variables={POLICIES_TABLE=${POLICIES_TABLE_NAME},ACTIVITIES_TABLE=${ACTIVITIES_TABLE_NAME},TENANT_ID=default,LOG_LEVEL=INFO}"

  if [[ -z "$existing_function" ]]; then
    log "Creating new Lambda function..."
    aws lambda create-function \
      --function-name "$FUNCTION_NAME" \
      --runtime python3.12 \
      --handler handler.handler \
      --role "$role_arn" \
      --code "S3Bucket=${ARTIFACTS_BUCKET},S3Key=${ARTIFACTS_KEY}" \
      --memory-size 256 \
      --timeout 120 \
      --tracing-config Mode=Active \
      --description "PolizaLab Renewal Checker — daily policy expiration scan (${ENV})" \
      --environment "$env_vars" \
      --tags "Project=PolizaLab,Feature=Renewals,Environment=${ENV}" \
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
      --timeout 120 \
      --tracing-config Mode=Active \
      --environment "$env_vars" \
      --region "$REGION" \
      --output text > /dev/null

    log "Waiting for configuration update to complete..."
    aws lambda wait function-updated \
      --function-name "$FUNCTION_NAME" \
      --region "$REGION"

    ok "Lambda function updated: $FUNCTION_NAME"
  fi

  # Set reserved concurrency (low for scheduled task)
  log "Setting reserved concurrency to 5..."
  aws lambda put-function-concurrency \
    --function-name "$FUNCTION_NAME" \
    --reserved-concurrent-executions 5 \
    --region "$REGION" \
    --output text > /dev/null
  ok "Reserved concurrency set"
}

# ---------------------------------------------------------------------------
# Helper: create/update CloudWatch Events rule + target
# ---------------------------------------------------------------------------
deploy_schedule() {
  local function_arn
  function_arn=$(aws lambda get-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query "Configuration.FunctionArn" \
    --output text)

  log "Setting up CloudWatch Events schedule rule: $RULE_NAME"

  # Create or update the rule
  aws events put-rule \
    --name "$RULE_NAME" \
    --schedule-expression "rate(1 day)" \
    --state ENABLED \
    --description "Triggers ${FUNCTION_NAME} daily to scan for expiring policies" \
    --tags "Key=Project,Value=PolizaLab" "Key=Feature,Value=Renewals" "Key=Environment,Value=${ENV}" \
    --region "$REGION" \
    --output text > /dev/null

  ok "EventBridge rule created/updated: $RULE_NAME"

  # Add Lambda as target
  aws events put-targets \
    --rule "$RULE_NAME" \
    --targets "Id=renewal-checker-target,Arn=${function_arn}" \
    --region "$REGION" \
    --output text > /dev/null

  ok "EventBridge target set: $FUNCTION_NAME"

  # Grant EventBridge permission to invoke Lambda
  local statement_id="eventbridge-${RULE_NAME}-invoke"
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "$statement_id" \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}" \
    --region "$REGION" 2>/dev/null \
    || log "  EventBridge invoke permission already exists (skipping)"

  ok "EventBridge schedule fully configured"
}

# ===========================================================================
# MAIN
# ===========================================================================
log "======================================================"
log "  PolizaLab CRM — Renewal Checker Deployment"
log "  Environment : $ENV"
log "  Region      : $REGION"
log "  Account     : $ACCOUNT_ID"
log "  Lambda      : $FUNCTION_NAME"
log "  Schedule    : rate(1 day)"
log "======================================================"

# Step 1 — IAM role + policy
log ""
log "STEP 1/4: IAM role + policy"
deploy_cfn_stack "$IAM_STACK" "$IAM_CF"

# Step 2 — Artifacts bucket + package + upload
log ""
log "STEP 2/4: Package and upload Lambda"
ensure_artifacts_bucket
LAMBDA_ZIP_PATH=""
package_lambda
upload_lambda_zip "$LAMBDA_ZIP_PATH"

# Step 3 — Lambda function
log ""
log "STEP 3/4: Lambda function"
deploy_lambda

# Step 4 — CloudWatch Events schedule
log ""
log "STEP 4/4: CloudWatch Events schedule"
deploy_schedule

# Done
log ""
log "======================================================"
log "  Deployment complete!"
log ""
log "  IAM stack       : $IAM_STACK"
log "  Lambda function : $FUNCTION_NAME"
log "  EventBridge rule: $RULE_NAME"
log "  Schedule        : rate(1 day)"
log "======================================================"
