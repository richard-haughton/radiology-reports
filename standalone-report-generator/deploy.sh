#!/usr/bin/env bash
# deploy.sh — Build and deploy the report generator to Cloud Run
# Usage: ./deploy.sh [PROJECT_ID] [REGION] [SERVICE_NAME]
set -euo pipefail

PROJECT_ID="${1:-reports-f4b1a}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-report-generator}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=== Deploying ${SERVICE_NAME} to Cloud Run ==="
echo "    Project : ${PROJECT_ID}"
echo "    Region  : ${REGION}"
echo "    Image   : ${IMAGE}"
echo

# Build and push with Cloud Build (no local Docker required)
gcloud builds submit \
  --tag "${IMAGE}" \
  --project "${PROJECT_ID}"

# Deploy to Cloud Run
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --project "${PROJECT_ID}"

echo
echo "=== Deploy complete ==="
gcloud run services describe "${SERVICE_NAME}" \
  --platform managed \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format "value(status.url)"
