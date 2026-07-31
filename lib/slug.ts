export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function uniqueSuffix(length = 4): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + length);
}
