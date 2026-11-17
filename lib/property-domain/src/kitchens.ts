export interface KitchenSpec {
  readonly layout?: "regular" | "american" | "preparatory";
  readonly equipment?: "equipped" | "unequipped";
  readonly access?: "private" | "shared";
}
export function kitchensApply(type: string, use?: unknown): boolean {
  return (
    ["apartment", "house", "villa", "chalet", "office", "shop"].includes(
      type,
    ) ||
    (type === "floor" && (use === "residential" || use === "commercial")) ||
    (type === "other_built_property" &&
      (use === "residential" || use === "commercial"))
  );
}
export function validKitchens(value: unknown): value is readonly KitchenSpec[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        Object.entries(item).every(([key, v]) =>
          key === "layout"
            ? ["regular", "american", "preparatory"].includes(String(v))
            : key === "equipment"
              ? ["equipped", "unequipped"].includes(String(v))
              : key === "access"
                ? ["private", "shared"].includes(String(v))
                : false,
        ),
    )
  );
}
/** One-to-one assignment; an unknown fact never becomes a positive match. */
export function compareKitchens(
  wanted: readonly KitchenSpec[],
  actual: readonly KitchenSpec[] | undefined,
): boolean | undefined {
  if (!actual) return undefined;
  if (wanted.length === 0) return actual.length === 0;
  if (actual.length < wanted.length) return false;
  const canAssign = (allowUnknown: boolean) => {
    const assigned = new Map<number, number>();
    const visit = (index: number, seen: Set<number>): boolean => {
      for (let j = 0; j < actual.length; j++) {
        if (seen.has(j)) continue;
        const fits = Object.entries(wanted[index]).every(
          ([key, value]) =>
            (actual[j] as Record<string, unknown>)[key] === value ||
            (allowUnknown &&
              (actual[j] as Record<string, unknown>)[key] === undefined),
        );
        if (!fits) continue;
        seen.add(j);
        if (!assigned.has(j) || visit(assigned.get(j)!, seen)) {
          assigned.set(j, index);
          return true;
        }
      }
      return false;
    };
    return wanted.every((_, index) => visit(index, new Set()));
  };
  return canAssign(false) ? true : canAssign(true) ? undefined : false;
}

/** New selections have at most three kitchens. Read compatibility deliberately retains older records. */
export function validKitchenSelection(value: unknown): value is readonly KitchenSpec[] {
  return validKitchens(value) && value.length <= 3;
}
