# TFLint configuration for Terraform in this repo
# Docs: https://github.com/terraform-linters/tflint

config {
  format = "compact"
}

# Enable AWS plugin for additional rules
plugin "aws" {
  enabled = true
}

# Set the default AWS region for rules that require it
rule "aws_region" {
  enabled = true
  # Align with variables/defaults; adjust if you use a different region
  region = "us-east-1"
}
