terraform {
  required_version = "1.17.1"

  cloud {
    organization = "KenyYahat"

    # Keep bootstrap resources out of the application's state.
    workspaces {
      name = "typign-bootstrap"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = { Application = "Typign", ManagedBy = "Terraform" }
  }
}
