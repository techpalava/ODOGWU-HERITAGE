# Measurement Blueprint Provenance

## Source

- Workbook: `Measurements.xlsx`
- SHA-256: `8B59AB078BDA1A7376CA3A6A77AA24CC3AFA760CCCD0B037C163A886FA919DF7`
- Worksheet: `Measurements-Steps-Website-v1`
- Header and definitions: rows 3-11
- Imported profile data: columns E-I and K, rows 13-266
- Blueprint version: `measurements-steps-website-v1@8b59ab07`
- Green route-marker conditional format: `G13:H405`, `containsText:Yes, Provide`, fill ARGB `FF66FFCC`
- Medium Risk uses the green-marked values in column G; High Risk uses column H.

The runtime does not parse the workbook. Its approved A-M profiles are encoded as typed configuration in `src/config/MeasurementBlueprintConfig.ts`, with the original profile code, source row, source label, route markers, notes, conditional or alternative status, and Average Factor provenance retained for auditability.

## Exclusions

- Placeholder profiles N and O, rows 267-294
- Blank rows
- Sewing-cost and pricing data, rows 297-405
- `#REF!` formula results
- Unrelated zero values

## Calculation status

- Formula version: `height-average-factor-v1` (`value = total_height × averageFactor`).
- Medium / High / Critical routes derive non-marker rows when a profile-row Average Factor is present and required manuals for that garment are complete.
- Medium / High keep unresolved mid/long sleeve groups as a customer one-of (do not silently auto-fill long).
- Critical defaults an unresolved mid/long sleeve group to the single factored sibling (`sleeve_length_long`) so profiles B/F/H can calculate from height; Mid Sleeve remains unavailable on Critical until an approved mid factor exists.
- Critical never includes Dress IF-APPLICABLE / square-neck rows (null-factor prefs), even when Custom Details prove them — so a U/square neck cannot disable Critical. Low Risk still requires square-neck length/width when a U/square neck option is selected. `under_bust_circumference`, dress `hip_circumference`, and `shoulder_to_under_bust_length` stay unproven/optional until catalogue proof IDs exist. Sleeveless finish still blocks Critical when it is the included alternative and has no factor.
- A small set of lower-body gaps use documented sibling **proxy** factors in `MeasurementBlueprintConfig.ts` (feet-back ≈ feet-side, lap midpoint, skirt bottom ≈ hip, long-skirt ankle ≈ pants ankle, long dress length ≈ long shirt length) until the workbook supplies dedicated values.

## Unresolved Decisions

- Conditional and alternative requirements remain blocked when stable Custom Details IDs do not prove the applicable choice.
- Kaftan, Full-length Gown, and Agbada remain unmapped because the workbook does not provide authoritative profiles for them.
- The foundation models one wearer. Multiple-wearer identity and measurement ownership require a separate authoritative contract.
