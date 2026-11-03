locals {
  runner_stages = toset(["plan", "apply"])
}

resource "aws_iam_role" "plan" {
  name = "typign-codebuild-plan"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account_id }
        ArnEquals    = { "aws:SourceArn" = "arn:${local.partition}:codebuild:${var.aws_region}:${var.aws_account_id}:project/typign-plan" }
      }
    }]
  })
}

resource "aws_iam_role_policy" "plan" {
  name = "typign-plan-read"
  role = aws_iam_role.plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:Get*", "s3:List*"], Resource = ["arn:${local.partition}:s3:::typign-web-*", "arn:${local.partition}:s3:::typign-web-*/*"] },
      { Effect = "Allow", Action = ["lambda:Get*", "lambda:List*"], Resource = [local.function_arn, "${local.function_arn}/*"] },
      { Effect = "Allow", Action = ["iam:Get*", "iam:List*"], Resource = "arn:${local.partition}:iam::${var.aws_account_id}:role/typign-web-*" },
      { Effect = "Allow", Action = ["logs:DescribeLogGroups", "logs:ListTagsForResource", "cloudformation:GetResource", "cloudformation:GetResourceRequestStatus", "cloudformation:ListResources"], Resource = "*" }
    ]
  })
}

resource "aws_cloudwatch_log_group" "runner" {
  for_each          = local.runner_stages
  name              = "/aws/codebuild/typign-${each.key}"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "runner_logs" {
  for_each = local.runner_stages
  name     = "codebuild-logs"
  role     = each.key == "apply" ? aws_iam_role.deploy.id : aws_iam_role.plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.runner[each.key].arn}:*"
    }]
  })
}

# GitHub OAuth authorization is configured once in the CodeBuild console.
# No source access tokens or OAuth secrets are stored in Terraform state.
resource "aws_codebuild_project" "runner" {
  for_each      = local.runner_stages
  name          = "typign-${each.key}"
  service_role  = each.key == "apply" ? aws_iam_role.deploy.arn : aws_iam_role.plan.arn
  build_timeout = 60
  artifacts { type = "NO_ARTIFACTS" }
  environment {
    compute_type    = "BUILD_GENERAL1_SMALL"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false
  }
  source {
    type     = "GITHUB"
    location = "https://github.com/${var.github_repository}.git"
  }
  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.runner[each.key].name
    }
  }
  depends_on = [aws_iam_role_policy.runner_logs, aws_iam_role_policy.plan, aws_iam_role_policy.deploy]
}

resource "aws_codebuild_webhook" "runner" {
  for_each     = local.runner_stages
  project_name = aws_codebuild_project.runner[each.key].name
  build_type   = "BUILD"
  # WORKFLOW_JOB_QUEUED does not support HEAD_REF. Branch restrictions live
  # in deploy.yml and the GitHub production/production-plan Environments.
  filter_group {
    filter {
      type    = "EVENT"
      pattern = "WORKFLOW_JOB_QUEUED"
    }
    filter {
      type    = "WORKFLOW_NAME"
      pattern = "^Deploy AWS$"
    }
    filter {
      type    = "ACTOR_ACCOUNT_ID"
      pattern = "^(${join("|", sort(tolist(var.allowed_github_actor_ids)))})$"
    }
  }
}
