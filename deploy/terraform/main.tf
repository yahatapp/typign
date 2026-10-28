data "aws_partition" "current" {}

locals {
  tags            = merge(var.tags, { Application = "Typign", ManagedBy = "Terraform" })
  function_arn    = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${var.aws_account_id}:web-function/${var.function_name}"
  artifact_sha256 = fileexists(var.artifact_path) ? filesha256(var.artifact_path) : ""
  log_group_name  = "/aws/lambda/web/${var.function_name}"
}

resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "typign-web-"
  force_destroy = var.force_destroy_artifacts
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowWebFunctionRevisionCodeRead"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = ["s3:GetObject", "s3:GetObjectVersion"]
      Resource  = "${aws_s3_bucket.artifacts.arn}/releases/*"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account_id }
        ArnLike      = { "aws:SourceArn" = "${local.function_arn}/revision/*" }
      }
    }]
  })
}

resource "aws_s3_object" "artifact" {
  bucket                 = aws_s3_bucket_versioning.artifacts.bucket
  key                    = "releases/${local.artifact_sha256}.zip"
  source                 = var.artifact_path
  source_hash            = local.artifact_sha256
  content_type           = "application/zip"
  server_side_encryption = "AES256"

  depends_on = [aws_s3_bucket_server_side_encryption_configuration.artifacts]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "central" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "local" {
  name              = "${local.log_group_name}.local"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "execution" {
  name_prefix = "typign-web-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "logs" {
  name = "write-typign-logs"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = [
        "${aws_cloudwatch_log_group.central.arn}:*",
        "${aws_cloudwatch_log_group.local.arn}:*",
      ]
    }]
  })
}

resource "awscc_lambda_web_function" "app" {
  function_name = var.function_name
  tags          = [for key, value in local.tags : { key = key, value = value }]

  # Complete the account-checked AWS resources before creating via Cloud Control.
  depends_on = [aws_iam_role_policy.logs]
}

resource "awscc_lambda_web_function_revision" "app" {
  function_name = awscc_lambda_web_function.app.function_name
  description   = "Artifact SHA256 ${local.artifact_sha256}"
  build_config = {
    code_config = {
      s3_object = {
        bucket     = aws_s3_object.artifact.bucket
        key        = aws_s3_object.artifact.key
        version_id = aws_s3_object.artifact.version_id
      }
    }
    runtime_config = { runtime = "nodejs24.x" }
  }
  service_config = {
    execution_role_arn              = aws_iam_role.execution.arn
    environment_variables           = { NODE_ENV = "production" }
    timeout_seconds                 = 30
    max_concurrency_per_environment = 16
    telemetry_config = {
      logging_config = {
        log_group             = aws_cloudwatch_log_group.central.name
        application_log_level = "INFO"
        system_log_level      = "INFO"
      }
    }
  }

  depends_on = [aws_s3_bucket_policy.artifacts, aws_s3_bucket_public_access_block.artifacts]

  # Shift the endpoint to the new immutable revision before deleting the old one.
  lifecycle {
    create_before_destroy = true
  }
}

resource "awscc_lambda_web_function_endpoint" "app" {
  function_name = awscc_lambda_web_function.app.function_name
  endpoint_name = var.endpoint_name
  endpoint_type = "HomeRegion"
  auth_type     = "ApplicationManaged"
  description   = "Typign browser MVP"
  revision_weights = [{
    revision_id = awscc_lambda_web_function_revision.app.revision_id
    weight      = 100
  }]
  scaling_config  = { max_environments = var.max_environments }
  throttle_config = { rate_limit = var.rate_limit }
}
