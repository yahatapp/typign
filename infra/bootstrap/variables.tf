variable "aws_account_id" {
  description = "Expected AWS account ID for deployment resources."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Use a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  description = "Region of the deployment resources."
  type        = string
  default     = "ap-northeast-1"
}

variable "github_repository" {
  description = "Case-sensitive GitHub OWNER/REPO allowed to assume the deployment role."
  type        = string
  default     = "yahatapp/typign"
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use OWNER/REPO without wildcards."
  }
}

variable "function_name" {
  description = "Web Function the deployment role may manage; match the parent infra configuration."
  type        = string
  default     = "typign-dev"
  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$", var.function_name))
    error_message = "Use a literal 2–64 character Web Function name."
  }
}

variable "allowed_github_actor_ids" {
  description = "Numeric GitHub user IDs allowed to start privileged CodeBuild runner jobs."
  type        = set(string)
  validation {
    condition     = length(var.allowed_github_actor_ids) > 0 && alltrue([for id in var.allowed_github_actor_ids : can(regex("^[0-9]+$", id))])
    error_message = "Provide at least one numeric GitHub user ID, not a login or organization ID."
  }
}
