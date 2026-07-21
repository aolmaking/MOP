# English-Only Product Policy

All first-party MOP product content must be written in English.

This includes:

- User interface labels, messages, errors, empty states, and notifications.
- API responses, validation messages, audit descriptions, and seeded data.
- Source comments, tests, fixtures, configuration, reports, and documentation.
- File and directory names.

Third-party dependencies and generated package caches are not product-owned content and are excluded from this rule.

Run the policy gate with:

```bash
pnpm validate:english-only
```

The gate scans project paths and text files across the Unicode ranges used by Arabic text. Any match fails validation.
