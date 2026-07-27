const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prisma's `id` column is typed uuid, so a malformed id in the URL (a typo,
// a stale bookmark, a crawler) makes findUnique throw at the query layer
// instead of returning null — every page keying off a MemoRun id must check
// this before querying, or it 500s instead of 404ing.
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}
