# Infrastructure notes

## Remote backend (recommended)

1. Create an S3 bucket and DynamoDB table for Terraform state/locks.
2. Copy `backend.tf.example` to `backend.tf` and adjust values.
3. Run:
   - `terraform init -migrate-state`

## WAF and logs
- WAFv2 Web ACL is applied with a rate-based rule only.
- API Gateway access logs and Lambda logs are retained 1 day for cost control.

## Variables
- See `variables.tf` and `terraform.tfvars.example`.
- `bedrock_model_id` must exist in your region.

## Health check route

The API includes a lightweight health endpoint for quick verification without invoking the chat flow:

- Route: `GET /status`
- Purpose: Returns a JSON payload with deployment region, model ID, and S3 configuration.

Example (replace `<api-id>` and `<region>`):

```bash
curl -sS https://<api-id>.execute-api.<region>.amazonaws.com/prod/status
```

Sample response:

```json
{
   "status": "ok",
   "region": "us-east-1",
   "modelId": "meta.llama3-8b-instruct-v1:0",
   "bucket": "portfolio-chatbot-data-prod",
   "prefix": "rag-data/",
   "time": "2025-11-01T23:54:07.711Z"
}
```

Notes:
- CORS is configured to allow `GET, POST, OPTIONS`.
- `terraform apply` outputs `status_endpoint` for convenience.
