mock_provider "aws" {
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
}

override_resource {
  target = aws_iam_role.deploy
  values = { arn = "arn:aws:iam::123456789012:role/typign-github-deploy" }
}
override_resource {
  target = aws_iam_role.plan
  values = { arn = "arn:aws:iam::123456789012:role/typign-codebuild-plan" }
}

variables {
  aws_account_id           = "123456789012"
  allowed_github_actor_ids = ["12345678"]
}

run "codebuild_deployment_contract" {
  command = apply
  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Principal.Service == "codebuild.amazonaws.com" && jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.ArnEquals["aws:SourceArn"] == "arn:aws:codebuild:ap-northeast-1:123456789012:project/typign-apply"
    error_message = "Only the apply CodeBuild project may assume the deployment role."
  }
  assert {
    condition     = toset(one([for statement in jsondecode(aws_iam_role_policy.deploy.policy).Statement : statement if statement.Sid == "WebFunction"]).Resource) == toset(["arn:aws:lambda:ap-northeast-1:123456789012:web-function/typign-dev", "arn:aws:lambda:ap-northeast-1:123456789012:web-function/typign-dev/*"])
    error_message = "Deployment permissions must stay scoped to the intended Web Function."
  }
  assert {
    condition     = one([for statement in jsondecode(aws_iam_role_policy.deploy.policy).Statement : statement if statement.Sid == "PassExecutionRole"]).Condition.StringEquals["iam:PassedToService"] == "lambda.amazonaws.com"
    error_message = "The execution role may only be passed to Lambda."
  }
}

run "runner_isolation" {
  command = apply
  assert {
    condition     = aws_codebuild_project.runner["plan"].service_role == aws_iam_role.plan.arn && aws_codebuild_project.runner["apply"].service_role == aws_iam_role.deploy.arn && aws_iam_role.plan.arn != aws_iam_role.deploy.arn
    error_message = "Plan and apply runners must have separate roles."
  }
  assert {
    condition     = alltrue([for statement in jsondecode(aws_iam_role_policy.plan.policy).Statement : alltrue([for action in statement.Action : can(regex("^[^:]+:(Get|List|Describe)", action))])])
    error_message = "Plan permissions must only read application infrastructure."
  }
  assert {
    condition     = alltrue([for project in aws_codebuild_project.runner : project.environment[0].privileged_mode == false])
    error_message = "Runner containers must not run Docker privileged mode."
  }
  assert {
    condition     = alltrue([for hook in aws_codebuild_webhook.runner : alltrue([for kind, pattern in { EVENT = "WORKFLOW_JOB_QUEUED", WORKFLOW_NAME = "^Deploy AWS$", ACTOR_ACCOUNT_ID = "^(12345678)$" } : anytrue([for filter in one(hook.filter_group).filter : filter.type == kind && filter.pattern == pattern])])])
    error_message = "Privileged runners must be restricted to the deployment workflow and approved actors."
  }
  assert {
    condition     = alltrue([for hook in aws_codebuild_webhook.runner : length(hook.filter_group) == 1 && toset([for filter in one(hook.filter_group).filter : filter.type]) == toset(["EVENT", "WORKFLOW_NAME", "ACTOR_ACCOUNT_ID"])])
    error_message = "Queued runner jobs must not use HEAD_REF or other push/PR-only filters."
  }
}

run "reject_empty_actors" {
  command = plan
  variables { allowed_github_actor_ids = [] }
  expect_failures = [var.allowed_github_actor_ids]
}

run "reject_function_wildcard" {
  command = plan
  variables {
    function_name = "typign-*"
  }
  expect_failures = [var.function_name]
}

run "reject_repository_wildcard" {
  command = plan
  variables {
    github_repository = "yahatapp/*"
  }
  expect_failures = [var.github_repository]
}
