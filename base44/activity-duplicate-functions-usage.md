# Activity Duplicate Functions

These functions replace the settings duplicate scan/fix flow for large Activity tables.

Base44 limits each `list()`/`filter()` request to 5,000 rows, so both functions page through the Activity entity in 5,000-row chunks.

## Functions

- `scanActivityDuplicates`: scans all Activity rows and returns duplicate groups keyed by `athlete_id + strava_id`.
- `fixActivityDuplicates`: scans all Activity rows and deletes duplicate rows in a bounded batch.

Both functions default to the `Activity` entity. If your entity is named differently, pass `entityName`.

## Settings Button Calls

Scan:

```ts
const result = await base44.functions.invoke("scanActivityDuplicates", {
  entityName: "Activity",
  sampleLimit: 100,
});
```

Dry-run fix:

```ts
const result = await base44.functions.invoke("fixActivityDuplicates", {
  entityName: "Activity",
  dryRun: true,
  maxDeletes: 500,
});
```

Real fix:

```ts
const result = await base44.functions.invoke("fixActivityDuplicates", {
  entityName: "Activity",
  dryRun: false,
  maxDeletes: 500,
});
```

Keep calling the real fix until `result.data.has_more` is false. Then run `scanActivityDuplicates` again to confirm `duplicate_group_count` is `0`.

## Keep Rule

For each duplicate key, the function keeps the best row using this order:

1. most populated fields
2. earliest `created_date`
3. lowest `id` as a final deterministic tie-break

Everything else in the same `athlete_id + strava_id` group is deleted.
