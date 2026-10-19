# Cost-first plan · estimates, not provider quotes

No service has been provisioned. Local development with available tools costs no new service fee. Currency volatility and access restrictions make unverified toman prices inappropriate.

| Scenario assumption | Proposed capacity to benchmark | Monthly planning envelope USD equivalent |
|---|---|---|
| Pilot ≤1k monthly active consumers, ≤100 cafés | One 2 vCPU / 4 GB API/web/worker host, database plus off-host backup | 15–40 |
| Early ≤10k MAU, ≤1k cafés | 4 vCPU / 8 GB plus isolated DB, bounded jobs/media | 50–150 |
| Growth ≤100k MAU | Horizontally scaled app, larger DB/storage and observability | 200–700+ |

These are hypothetical budget allowances, not current market pricing or capacity guarantees. Load-test before sizing. They exclude SMS, store memberships, taxes, egress beyond assumptions, human review, legal review and reward funding. Free tiers are optional experiments, not a reliability promise. No LLM costs by default.

SMS budget = attempted billable segments × approved provider price; include resend/failed-delivery billing policy. Media budget = stored GB + delivered GB + requests + backup copies. Reward liability = funded outstanding eligible redemptions, separate from infrastructure. Stars have no implicit cash equivalence. Approve provider quotes, legal availability, Iranian reachability and ceilings before enabling. Alert at 50/80/100% and stop consequential work at budget exhaustion.
