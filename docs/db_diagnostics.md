# Database Diagnostics Cheat Sheet

Use these SQL snippets with `psql -v ON_ERROR_STOP=1` to inspect the production database when debugging migrations or ENUM issues.

## Enumerated types and values

```sql
SELECT t.typname, e.enumlabel
FROM pg_type AS t
JOIN pg_enum AS e ON t.oid = e.enumtypid
WHERE t.typname LIKE 'contact_%'
ORDER BY 1, 2;
```

## Columns that reference a specific ENUM

```sql
SELECT c.relname AS table_name, a.attname AS column_name
FROM pg_type AS t
JOIN pg_attribute AS a ON a.atttypid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_class AS c ON c.oid = a.attrelid
WHERE t.typname = 'contact_preferred_channel';
```

## Duplicate indexes

```sql
SELECT indexrelid::regclass AS index_name, indrelid::regclass AS table_name
FROM pg_index
GROUP BY indexrelid, indrelid
HAVING COUNT(*) > 1;
```
