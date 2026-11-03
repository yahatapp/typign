output "deployment_role_arn" {
  description = "Apply runner service role; no AWS_ROLE_ARN GitHub variable is required."
  value       = aws_iam_role.deploy.arn
}

output "runner_project_names" {
  description = "CodeBuild project names used by the deploy workflow labels."
  value       = { for stage, project in aws_codebuild_project.runner : stage => project.name }
}
