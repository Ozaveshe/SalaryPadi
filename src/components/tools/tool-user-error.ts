/** Marks deliberately curated copy that is safe to render to a tool user. */
export class ToolUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolUserError";
  }
}
