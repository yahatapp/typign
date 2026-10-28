mock_provider "aws" {
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/typign-web-test" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::typign-web-test", id = "typign-web-test" }
  }
  mock_resource "aws_s3_object" {
    defaults = { version_id = "artifact-version-1" }
  }
}

mock_provider "awscc" {
  mock_resource "awscc_lambda_web_function_revision" {
    defaults = { revision_id = "rev-test" }
  }
  mock_resource "awscc_lambda_web_function_endpoint" {
    defaults = { domain_name = "typign-test.example.invalid" }
  }
}

variables {
  aws_account_id = "123456789012"
  artifact_path  = "tests/fixtures/artifact.zip"
}

run "deployment_contract" {
  command = apply

  assert {
    condition     = awscc_lambda_web_function_revision.app.build_config.runtime_config.runtime == "nodejs24.x" && awscc_lambda_web_function_revision.app.build_config.code_config.s3_object.version_id == "artifact-version-1"
    error_message = "The revision must use Node.js 24 and a pinned S3 artifact version."
  }
  assert {
    condition     = awscc_lambda_web_function_endpoint.app.revision_weights[0].revision_id == "rev-test" && awscc_lambda_web_function_endpoint.app.revision_weights[0].weight == 100
    error_message = "The endpoint must explicitly route all traffic to the managed revision."
  }
  assert {
    condition     = awscc_lambda_web_function_endpoint.app.auth_type == "ApplicationManaged" && awscc_lambda_web_function_endpoint.app.endpoint_type == "HomeRegion" && awscc_lambda_web_function_endpoint.app.scaling_config.max_environments == 2 && awscc_lambda_web_function_endpoint.app.throttle_config.rate_limit == 100
    error_message = "The browser endpoint must have the intended public access and bounded scaling defaults."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.artifacts.block_public_policy && aws_s3_bucket_versioning.artifacts.versioning_configuration[0].status == "Enabled" && !aws_s3_bucket.artifacts.force_destroy
    error_message = "Artifacts must be private, versioned, and protected against bucket-wide deletion by default."
  }
  assert {
    condition     = jsondecode(aws_s3_bucket_policy.artifacts.policy).Statement[0].Condition.ArnLike["aws:SourceArn"] == "arn:aws:lambda:ap-northeast-1:123456789012:web-function/typign-dev/revision/*" && jsondecode(aws_s3_bucket_policy.artifacts.policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012"
    error_message = "Lambda's artifact access must be restricted to this function and account."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.logs.policy).Statement) == 1 && toset(jsondecode(aws_iam_role_policy.logs.policy).Statement[0].Action) == toset(["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]) && length(jsondecode(aws_iam_role_policy.logs.policy).Statement[0].Resource) == 2
    error_message = "The application role must only write its centralized and local logs."
  }
  assert {
    condition     = aws_cloudwatch_log_group.central.retention_in_days == 14 && aws_cloudwatch_log_group.local.retention_in_days == 14 && output.health_url == "https://typign-test.example.invalid/health"
    error_message = "Both log groups need retention, and the output must provide a usable health-check URL."
  }
}

run "stop_new_requests" {
  command = apply
  variables {
    rate_limit = 0
  }
  assert {
    condition     = awscc_lambda_web_function_endpoint.app.throttle_config.rate_limit == 0
    error_message = "Zero must remain available for closing the endpoint to new requests."
  }
}

run "reject_unsupported_rate" {
  command = plan
  variables {
    rate_limit = 50
  }
  expect_failures = [var.rate_limit]
}

run "reject_wrong_account_format" {
  command = plan
  variables {
    aws_account_id = "123"
  }
  expect_failures = [var.aws_account_id]
}

run "reject_too_few_environments" {
  command = plan
  variables {
    max_environments = 1
  }
  expect_failures = [var.max_environments]
}

run "reject_missing_package" {
  command = plan
  variables {
    artifact_path = "tests/fixtures/missing.zip"
  }
  expect_failures = [var.artifact_path]
}
