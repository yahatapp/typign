data "aws_partition" "current" {}

locals {
  partition    = data.aws_partition.current.partition
  function_arn = "arn:${local.partition}:lambda:${var.aws_region}:${var.aws_account_id}:web-function/${var.function_name}"
}

resource "aws_iam_role" "deploy" {
  name                 = "typign-github-deploy"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.aws_account_id }
        ArnEquals    = { "aws:SourceArn" = "arn:${local.partition}:codebuild:${var.aws_region}:${var.aws_account_id}:project/typign-apply" }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "typign-deployment"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Artifacts"
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = ["arn:${local.partition}:s3:::typign-web-*", "arn:${local.partition}:s3:::typign-web-*/*"]
      },
      {
        # Cloud Control has no resource-level authorization for these operations.
        Sid      = "CloudControl"
        Effect   = "Allow"
        Action   = ["cloudformation:CreateResource", "cloudformation:GetResource", "cloudformation:UpdateResource", "cloudformation:DeleteResource", "cloudformation:GetResourceRequestStatus", "cloudformation:CancelResourceRequest", "cloudformation:ListResources", "cloudformation:ListResourceRequests"]
        Resource = "*"
      },
      {
        Sid      = "WebFunction"
        Effect   = "Allow"
        Action   = ["lambda:CreateWebFunction", "lambda:GetWebFunction", "lambda:DeleteWebFunction", "lambda:CreateWebFunctionRevision", "lambda:GetWebFunctionRevision", "lambda:DeleteWebFunctionRevision", "lambda:CreateWebFunctionEndpoint", "lambda:GetWebFunctionEndpoint", "lambda:UpdateWebFunctionEndpoint", "lambda:DeleteWebFunctionEndpoint", "lambda:ListWebFunctionRevisions", "lambda:ListWebFunctionEndpoints", "lambda:ListTags", "lambda:TagResource", "lambda:UntagResource"]
        Resource = [local.function_arn, "${local.function_arn}/*"]
      },
      {
        Sid      = "ExecutionRole"
        Effect   = "Allow"
        Action   = ["iam:CreateRole", "iam:GetRole", "iam:DeleteRole", "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole"]
        Resource = "arn:${local.partition}:iam::${var.aws_account_id}:role/typign-web-*"
      },
      {
        Sid       = "PassExecutionRole"
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = "arn:${local.partition}:iam::${var.aws_account_id}:role/typign-web-*"
        Condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } }
      },
      {
        Sid      = "ApplicationLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:ListTagsForResource", "logs:TagResource", "logs:UntagResource", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy"]
        Resource = "arn:${local.partition}:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/web/${var.function_name}*"
      },
      {
        Sid      = "DescribeLogs"
        Effect   = "Allow"
        Action   = "logs:DescribeLogGroups"
        Resource = "*"
      }
    ]
  })
}
