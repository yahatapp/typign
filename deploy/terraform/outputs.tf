output "url" {
  description = "Public HTTPS URL. The current application has no login requirement."
  value       = "https://${awscc_lambda_web_function_endpoint.app.domain_name}"
}

output "health_url" {
  description = "Send an HTTP GET here after apply; Active alone does not verify server startup."
  value       = "https://${awscc_lambda_web_function_endpoint.app.domain_name}/health"
}

output "revision_id" {
  description = "Revision receiving 100% of endpoint traffic."
  value       = awscc_lambda_web_function_revision.app.revision_id
}

output "artifact_bucket" {
  description = "Private, versioned deployment-artifact bucket."
  value       = aws_s3_bucket.artifacts.id
}

output "log_groups" {
  description = "CloudWatch log groups with explicit retention."
  value       = [aws_cloudwatch_log_group.central.name, aws_cloudwatch_log_group.local.name]
}
