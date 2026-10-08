---
name: data-storage-selection
description: Choosing data stores by access pattern - relational, document, key-value, column-family, graph, time-series, object, search, vector, analytics - with heuristics, polyglot persistence and antipatterns
domain: software-architecture
tags: data,storage,database,polyglot-persistence,nosql,relational
apply_when: "picking a database or adding a second store; a workload has point lookups, analytics, search or telemetry needs the current store handles badly; reviewing 'one database for everything'"
sources: "Microsoft - Understand data models, Azure Architecture Center, 2025-26 (read); Microsoft - Data partitioning guidance (read); Kleppmann and Riccomini - Designing Data-Intensive Applications 2nd ed. (not read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/software-architecture/items/data-storage-selection.md
copied: 2026-10-09
---

# Data storage selection

Medium confidence: the model catalogue comes from one vendor guide (product names dropped here);
the book usually cited for storage engines was not read.

## Method (Azure)

1. List the access patterns: point reads, aggregations, full-text, similarity, time-window
   scans, object delivery.
2. Map each to a storage model.
3. Shortlist products that implement it.
4. Judge by consistency, latency, scale, governance, cost.
5. Combine models only where access patterns or lifecycles clearly diverge.

## Model catalogue

| Model | Strengths | Watch out for | Typical workloads |
|---|---|---|---|
| Relational (OLTP) | multi-row ACID, joins, constraints, mature tooling | horizontal scale needs sharding; normalization raises join cost for read-heavy views | orders, ledgers, billing |
| Document | aggregate stored whole, flexible schema, multi-field indexes | document growth, limited transaction scope, data shape must fit queries | catalogs, content, profiles |
| Key-value | simplicity, low latency, linear scale | little query power, whole-value overwrite | cache, sessions, feature flags |
| Column-family | high write throughput, wide sparse rows | row-key design up front, weaker ad-hoc queries | telemetry, personalization |
| Graph | deep relationship traversal | overhead when relationships are shallow | social, fraud rings, dependencies |
| Time series | high-volume ingest, time-window queries, compression | tag cardinality, retention cost, specialized query language | metrics, IoT, monitoring |
| Object/file | huge scale, tiered cost, durable | whole-object operations, limited metadata query | media, backups, data lake |
| Search | full-text relevance, faceting | index is eventually consistent; separate indexing pipeline | product and log search |
| Vector | similarity search | index complexity, latency versus accuracy | semantic search, recommendations |
| Analytics (OLAP) | large scans and aggregation, BI | orchestration cost, ad-hoc latency | reporting, data science |

## Heuristics (Azure)

Strict multi-entity transactions: relational. Evolving aggregate shape with JSON-centric
APIs: document. Extreme low-latency lookups or cache: key-value. Wide write-heavy telemetry:
column-family or time series. Deep relationships: graph. Historical analytical scans:
analytics store. Binaries: object store. Full-text relevance: search.

## Combine, but carefully

Add a second model when access patterns diverge (point lookup versus analytical scan versus
full-text), lifecycles differ, or latency and throughput needs conflict. Azure's
antipatterns: several microservices sharing one database (coupling), adding a store without
operational maturity (monitoring, backup), and using a search index as the primary store.

Re-evaluate when: ad-hoc joins grow on a document store (add a relational read model); analytic
aggregations load the search index (offload to an analytics engine); large denormalized
documents cause partial-update contention (reshape aggregates); time-window queries slow on a
column-family store (adopt time series).

## Use when

- New system, new subsystem, or a store that shows the signals above.

## Do not use when

- One store still meets performance, scale and governance needs: use it (Azure: avoid
  premature fragmentation). A team's operational skill is part of the decision.

## Trade-offs

- Polyglot persistence fits each pattern but multiplies operations, backup, security and
  consistency handling across stores (`data-consistency-models`).
- Aggregate-shaped stores read one entity fast and serve cross-entity queries poorly;
  read models (`style-cqrs-event-sourcing`) or materialized projections fill the gap.

## Common mistakes

- Choosing by fashion rather than access patterns.
- Treating a cache or search index as the system of record (`data-caching`).
- Sharing a database between services as an integration mechanism.

## Related

- Notes: `data-replication-partitioning`, `data-consistency-models`, `data-caching`,
  `data-batch-vs-stream`, `ddd-aggregates`, `style-cqrs-event-sourcing`
