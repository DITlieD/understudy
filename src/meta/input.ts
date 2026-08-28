export function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing ${key}`);
  }
  return value;
}

export function requireStringMap(
  input: Record<string, unknown>,
  key: string,
): Record<string, string> {
  const value = input[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`missing ${key}`);
  }
  const mapped: Record<string, string> = {};
  for (const [field, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== "string") {
      throw new Error(`${key}.${field} must be a string`);
    }
    mapped[field] = item;
  }
  return mapped;
}
