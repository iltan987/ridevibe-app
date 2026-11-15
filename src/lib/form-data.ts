/** Text of a form field: "" when it is missing or a file (never "[object File]"). Dependency-free for `node --test`. */
export function formDataText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Every text entry of a form field, in order; files are skipped. Dependency-free for `node --test`. */
export function formDataTexts(form: FormData, name: string): string[] {
  return form.getAll(name).filter((value) => typeof value === "string");
}
