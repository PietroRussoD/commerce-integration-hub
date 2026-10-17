// Only the current cursor is shareable in the URL. Adjacent pages depend on the
// opaque cursors actually visited in this browser history entry.
export function previousDeliveryCursors(state: unknown, search: string): Array<string | null> {
  if (typeof state !== "object" || state === null || !("deliveryListNavigation" in state)) return [];
  const navigation = state.deliveryListNavigation;
  if (typeof navigation !== "object" || navigation === null) return [];
  if (!("search" in navigation) || navigation.search !== search || !("previousCursors" in navigation)) return [];
  const cursors = navigation.previousCursors;
  return Array.isArray(cursors) && cursors.every((cursor: unknown) => cursor === null || typeof cursor === "string")
    ? cursors as Array<string | null>
    : [];
}

export function deliveryListNavigationState(search: string, previousCursors: Array<string | null>) {
  return { deliveryListNavigation: { search, previousCursors } };
}
