terraform {
  required_version = "1.17.1"

  cloud {
    organization = "KenyYahat"

    workspaces {
      name = "typign"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.70.0"
    }
    awscc = {
      source  = "hashicorp/awscc"
      version = "1.108.0"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.tags
  }
}

provider "awscc" {
  region = var.aws_region
}
