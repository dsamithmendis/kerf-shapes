import { basename, extname } from "node:path";

export function toPascalCase(input: string): string {
  const camel = input
    .replace(/[^A-Za-z0-9]+(.)?/g, (_match, chr: string | undefined) =>
      chr ? chr.toUpperCase() : ""
    )
    .replace(/^[^A-Za-z]+/, "");
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Derives a PascalCase component name from a source file's basename. */
export function componentNameFromFile(filePath: string): string {
  const base = basename(filePath, extname(filePath));
  const name = toPascalCase(base);
  return name || "TracedShape";
}

export function assertValidComponentName(name: string): void {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    throw new Error(
      `"${name}" isn't a valid React component name — use PascalCase starting with a ` +
        `capital letter, e.g. "NotchCard" or "BeveledBanner".`
    );
  }
}
