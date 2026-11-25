[Plan](../../planning.md) · [Stories](../../user_story.md) · [States](../state.md)

```mermaid
sequenceDiagram
    actor Staff
    Staff->>ClubService: Submit roster action
    ClubService->>SQLite: Check current roles and club state
    ClubService->>SQLite: Apply action and audit in transaction
    SQLite-->>Staff: Updated roster on refresh
```
