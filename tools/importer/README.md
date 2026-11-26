# Game set importer

*(Not built yet.)* This folder holds the data source manifest, [data-sources.json](data-sources.json).

## Statuses

| Status | Meaning |
|---|---|
| `approved` | May be imported once the checks below pass |
| `hold` | Do not import. A named question is still open |
| `excluded` | Do not import |

## Rules the importer must enforce

*(No code enforces these yet. Follow them by hand until the importer does.)*

1. Refuse any source that is not listed.
2. Refuse any source whose status is not `approved`.
3. Refuse an approved source whose `attribution` is empty. Copy the publisher's exact credit text first.
4. Stamp every imported record with the source `id`, version, license, attribution and download date, so a source can be removed and a model retrained.
5. Save a copy of the license as it read on the download date.

## Changing a status

- Read the license text or the publisher's licensing page, not a search summary.
- Update `status`, `url`, `checkedOn` and `evidence` in the same change.
- Meet every entry in `conditions`.

## Limits

- `approved` means the license reviewed allows commercial reuse with its conditions. It is not legal advice.
- `not-addressed-in-reviewed-text` means no AI training restriction was seen, not that training is cleared. Get legal review before selling a model or game packages.
- Keep third-party content out of Emberreach's rules, `data/` and app. See the original-content rule in [AGENTS.md](../../AGENTS.md).
