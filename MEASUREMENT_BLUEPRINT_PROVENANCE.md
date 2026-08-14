# Measurement Blueprint Provenance

## Source

- Workbook: `Measurements.xlsx`
- SHA-256: `8B59AB078BDA1A7376CA3A6A77AA24CC3AFA760CCCD0B037C163A886FA919DF7`
- Worksheet: `Measurements-Steps-Website-v1`
- Header and definitions: rows 3-11
- Imported profile data: columns E-I and K, rows 13-266
- Blueprint version: `measurements-steps-website-v1@8b59ab07`
- Green route-marker conditional format: `G13:H405`, `containsText:Yes, Provide`, fill ARGB `FF66FFCC`
- Mid Risk uses the green-marked values in column G; High Risk uses column H.

The runtime does not parse the workbook. Its approved A-M profiles are encoded as typed configuration in `src/config/MeasurementBlueprintConfig.ts`, with the original profile code, source row, source label, route markers, notes, conditional or alternative status, and Average Factor provenance retained for auditability.

## Exclusions

- Placeholder profiles N and O, rows 267-294
- Blank rows
- Sewing-cost and pricing data, rows 297-405
- `#REF!` formula results
- Unrelated zero values

## Unresolved Decisions

- Column K provides Average Factors but does not define an authoritative calculation equation. Automatic derivation remains disabled and the formula version is `null`.
- Mid- and High-Risk routes remain blocked when completion would depend on an unapproved formula or a missing factor.
- Conditional and alternative requirements remain blocked when stable Custom Details IDs do not prove the applicable choice.
- Kaftan, Full-length Gown, and Agbada remain unmapped because the workbook does not provide authoritative profiles for them.
- The foundation models one wearer. Multiple-wearer identity and measurement ownership require a separate authoritative contract.
