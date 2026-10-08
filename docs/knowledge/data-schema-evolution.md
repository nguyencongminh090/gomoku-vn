---
name: data-schema-evolution
description: Evolving schemas and message formats without breaking readers - expand/migrate/contract for databases and APIs, backward-compatible message changes, reserved field numbers, tolerant readers, versioning events
domain: software-architecture
tags: data,schema-evolution,compatibility,migration,messages,versioning
apply_when: "changing a database schema, API payload or event format while old and new code coexist; independent deployments of producers and consumers; planning a breaking change"
sources: "Fowler - Parallel Change (expand, migrate, contract), martinfowler.com (read); Protocol Buffers language guide, updating a message type, protobuf.dev (read); Microsoft - Publisher-Subscriber pattern, message schema evolution consideration (read); Microsoft - Web API design, versioning section (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/software-architecture/items/data-schema-evolution.md
copied: 2026-10-09
---

# Schema evolution

Medium confidence: sources are sound but cover specific tools (Protocol Buffers) and one
pattern write-up; the general treatment in the data-systems literature was not read.

## The core problem

Producers and consumers, or old and new application versions, run at the same time during
deployments, and stored data outlives code. A change is safe only if both versions can work
with both data shapes for the overlap period.

## Expand, migrate, contract (parallel change, Fowler)

1. **Expand:** extend the interface or schema so old and new forms both work; existing
   clients continue unchanged.
2. **Migrate:** move consumers to the new form, gradually; for external clients this can last
   long.
3. **Contract:** remove the old form once nobody uses it.

Fowler lists database schema evolution among its main uses, besides published interfaces and
remote APIs. Benefit: code can be released in any of the three phases, lowering risk. Cost:
during migration the supplier maintains both forms. The discipline that matters is finishing
the contract step, since skipping it leaves the system worse than before.

Typical database example (illustrative): add the new column, write to both, backfill, switch
reads, then drop the old column in a later release.

## Message and wire formats

- **Additive changes are safest.** Adding optional fields keeps existing consumers working;
  consumers should ignore fields they do not recognize (Azure pub/sub guidance).
- **Protocol Buffers rules:** never change or reuse a field number (changing it equals
  deleting and adding a field); when removing a field, reserve its number and name so no one
  reuses them (reuse can cause data corruption and parse errors). Adding fields, removing
  fields (with reservation), and adding enum values are wire-compatible; changing types is
  only conditionally safe. Unknown fields are preserved by proto3 parsers, but converting
  through JSON or copying field by field can drop them.
- **Breaking changes:** publish a new version: a new topic (`orders.v2`) or a version field in
  metadata (Azure); or version an HTTP API in URI, query string, header or media type, each
  with different caching and routing costs (`dist-api-design`).
- Events are stored and replayed, so old shapes remain readable for as long as they are
  retained (`style-cqrs-event-sourcing`).

## Compatibility checklist

| Question | Yes means |
|---|---|
| Can new code read old data? | backward compatible |
| Can old code read new data (ignoring the extras)? | forward compatible |
| Are removed identifiers reserved? | no accidental reuse |
| Is there a schedule and owner for the contract step? | migration will finish |

The terms backward and forward compatible here are this note's shorthand for the two
questions; sources phrase them in their own words.

## Use when

- Any change to a shared database, API contract or event schema in a system deployed without
  downtime, or with independently released components.

## Do not use when

- One team deploys all readers and writers together and can take a maintenance window: a
  direct migration is simpler. Internal APIs with one client may need no versioning (Azure).

## Trade-offs

- Compatibility work slows changes slightly and requires tests against old data, but avoids
  coordinated releases.
- Long migrations accumulate dual-format code; set an end date.

## Common mistakes

- Renaming or repurposing a field in place.
- Reusing a removed field number or name.
- Dropping the old column in the same release as the new writer.
- No compatibility tests against real old payloads.

## Related

- Notes: `dist-api-design`, `dist-messaging-patterns`, `style-cqrs-event-sourcing`,
  `evolve-strangler-migration`, `quality-modifiability`
