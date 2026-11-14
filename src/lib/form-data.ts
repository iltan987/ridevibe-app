/** Text of a form field: "" when it is missing or a file (never "[object File]"). Dependency-free for `node --test`. */
export function formDataText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
