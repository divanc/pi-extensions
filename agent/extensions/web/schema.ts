import { Type } from "typebox";

export function stringEnum(values: readonly string[], options: Record<string, unknown> = {}) {
  return Type.Unsafe<string>({ type: "string", enum: [...values], ...options });
}
