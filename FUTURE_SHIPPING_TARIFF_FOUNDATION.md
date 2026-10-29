# Future Shipping Tariff Foundation

This configuration is dormant reference data for the future nine-stage Design Studio. It is not connected to Step 8, production pricing, cart totals, checkout, deposits, shipping snapshots, or order persistence.

## Supplied values

- Exact garment/weight references are 5 garments = 2 kg, 12 = 5 kg, 24 = 10 kg, and 48 = 20 kg. No interpolation is defined.
- Individual Lagos-to-Eindhoven carriage is confirmed at EUR 131.25 per 1–10 garments (under 5 kg). The source also mentioned EUR 125 and approximately NGN 200,000; EUR 125 is not the charged amount. Additional blocks of 10 garments each add another EUR 131.25.
- Batch Lagos-to-Eindhoven carriage remains pending because EUR 15.09 is supplied but its per-garment versus per-order unit requires confirmation.
- Batch duty/tax remains pending because EUR 3 conflicts with EUR 3.50 and its calculation basis is unknown.
- Individual duty/tax remains pending because EUR 70 is supplied without a confirmed calculation basis.
- Eindhoven collection is distinct from destination delivery. No collection or handling fee was supplied, so the future rule does not encode pickup as free.
- The only active future baseline references are destination-delivery rates below 5 kg: Eindhoven EUR 9.75; elsewhere in the Netherlands EUR 9.75; Europe EUR 26.60; North America EUR 60.80; South America, Africa, and Asia EUR 78.00.

Rates at or above 5 kg, weights inferred from non-reference garment counts, unmapped destination zones, and unsupported destinations require a quote or remain unavailable. No unresolved amount is converted to zero.

## Production separation

Production Individual home delivery charges Lagos-to-Eindhoven shipping separately (EUR 131.25 per 10 garments / under 5 kg). Eindhoven pickup has no Lagos shipping charge. Community stays all-inclusive. The live five-stage shipping engine also has existing batch, pickup, and multi-band final-mile behaviour. Activating these future rules inside Design Studio pricing, cart pricing, checkout validation, or persisted shipping snapshots would risk charging inbound or final-mile shipping twice. A later Step 8 integration must define the migration and activation boundary explicitly.
