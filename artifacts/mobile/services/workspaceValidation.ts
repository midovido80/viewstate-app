export interface WorkspaceValidationIssue {
  code: string;
  keys: string[];
  paths: string[];
}

export class WorkspaceValidationError extends Error {
  constructor(
    message: string,
    readonly issues: WorkspaceValidationIssue[],
  ) {
    super(message);
    this.name = "WorkspaceValidationError";
  }
}
