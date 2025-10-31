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
