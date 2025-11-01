output "aws_s3_bucket_portfolio_data_id" {
  value = aws_s3_bucket.portfolio_data.bucket
}
# infrastructure/main.tf - Terraform for AWS Lambda + API Gateway + S3 + Bedrock

provider "aws" {
  region = var.aws_region
  profile = var.aws_profile
}

resource "aws_s3_bucket" "portfolio_data" {
  bucket = "${var.project_name}-data-${var.environment}"
  force_destroy = true
}

# Server-side encryption (SSE-S3) using dedicated resource (recommended)
resource "aws_s3_bucket_server_side_encryption_configuration" "portfolio_data_sse" {
  bucket = aws_s3_bucket.portfolio_data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access for the portfolio data bucket
resource "aws_s3_bucket_public_access_block" "portfolio_data_block" {
  bucket                  = aws_s3_bucket.portfolio_data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-role-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_s3_bedrock" {
  name = "${var.project_name}-lambda-s3-bedrock-${var.environment}"
  role = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_s3_bedrock.json
}

data "aws_iam_policy_document" "lambda_s3_bedrock" {
  statement {
    actions = [
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.portfolio_data.arn,
      "${aws_s3_bucket.portfolio_data.arn}/*"
    ]
  }
  statement {
    actions = [
      "bedrock:InvokeModel"
    ]
    # Limit to the specific foundation model in the chosen region
    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_model_id}"
    ]
  }
}

resource "aws_lambda_function" "chatbot" {
  function_name = "${var.project_name}-${var.environment}"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "../lambda/function.zip"
  source_code_hash = filebase64sha256("../lambda/function.zip")
  memory_size   = var.lambda_memory_size
  timeout       = var.lambda_timeout
  environment {
    variables = {
      S3_BUCKET_NAME = aws_s3_bucket.portfolio_data.bucket
      S3_DATA_PREFIX = var.s3_data_prefix
      MAX_TOKENS     = var.max_tokens
      TEMPERATURE    = var.temperature
    }
  }
}

# CloudWatch log group for Lambda with minimal retention to control costs
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.chatbot.function_name}"
  retention_in_days = 1
}

resource "aws_apigatewayv2_api" "chatbot_api" {
  name          = "${var.project_name}-api-${var.environment}"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = [
      "https://www.ousseinioumarou.com",
      "https://ousseinioumarou.com",
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://[::]:8000"
    ]
    allow_methods = ["POST", "GET", "OPTIONS"]
    allow_headers = ["content-type"]
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id           = aws_apigatewayv2_api.chatbot_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.chatbot.invoke_arn
  integration_method = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "chatbot_route" {
  api_id    = aws_apigatewayv2_api.chatbot_api.id
  route_key = "POST /chat"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Health check route: GET /status
resource "aws_apigatewayv2_route" "status_route" {
  api_id    = aws_apigatewayv2_api.chatbot_api.id
  route_key = "GET /status"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "chatbot_stage" {
  api_id      = aws_apigatewayv2_api.chatbot_api.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_access_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId",
      httpMethod     = "$context.httpMethod",
      routeKey       = "$context.routeKey",
      status         = "$context.status",
      ip             = "$context.identity.sourceIp",
      requestTime    = "$context.requestTime",
      protocol       = "$context.protocol",
      responseLength = "$context.responseLength"
    })
  }

  # Basic throttling to mitigate abuse on HTTP API (WAF association not supported for HTTP APIs)
  default_route_settings {
    throttling_rate_limit  = 5
    throttling_burst_limit = 20
  }
}

resource "aws_lambda_permission" "apigw_lambda" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chatbot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.chatbot_api.execution_arn}/*/*"
}

output "api_endpoint" {
  value = "${aws_apigatewayv2_api.chatbot_api.api_endpoint}/${aws_apigatewayv2_stage.chatbot_stage.name}/chat"
}

output "status_endpoint" {
  value = "${aws_apigatewayv2_api.chatbot_api.api_endpoint}/${aws_apigatewayv2_stage.chatbot_stage.name}/status"
}

# CloudWatch Log Group for API Gateway access logs
resource "aws_cloudwatch_log_group" "apigw_access_logs" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}"
  retention_in_days = 1
}

# WAFv2 Web ACL with a single rate-based rule (no country allow-list)
## WAF association for API Gateway HTTP API is not supported. If needed, place the API behind CloudFront and attach WAF to the distribution.
