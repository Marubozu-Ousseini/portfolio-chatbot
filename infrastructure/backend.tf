terraform {
  backend "s3" {
    bucket               = "tf-backend-static-portfolio-website"
    key                  = "terraform.tfstate"
    workspace_key_prefix = "portfolio-chatbot"
    region               = "us-east-1"
    dynamodb_table       = "tf-locks-static-portfolio-website"
    encrypt              = true
  }
}
