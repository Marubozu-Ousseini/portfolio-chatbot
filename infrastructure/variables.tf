# infrastructure/variables.tf - Terraform variables for portfolio chatbot

variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile name"
  type        = string
  default     = "default"
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "portfolio-chatbot"
}

variable "environment" {
  description = "Deployment environment (e.g., prod, dev)"
  type        = string
  default     = "prod"
}

variable "lambda_memory_size" {
  description = "Lambda memory size (MB)"
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Lambda timeout (seconds)"
  type        = number
  default     = 30
}

variable "max_tokens" {
  description = "Max tokens for LLM response"
  type        = number
  default     = 500
}

variable "temperature" {
  description = "LLM temperature"
  type        = number
  default     = 0.7
}

variable "s3_data_prefix" {
  description = "Prefix in S3 bucket to load additional RAG documents from"
  type        = string
  default     = "rag-data/"
}

variable "scrape_urls" {
  description = "https://www.linkedin.com/in/marubozu, https://www.ousseinioumarou.com"
  type        = string
  default     = ""
}
