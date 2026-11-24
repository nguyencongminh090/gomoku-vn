# Club poll — state

```mermaid
stateDiagram-v2
  [*] --> Open: /binhchon (member, toggle on)
  Open --> Open: vote / change vote
  Open --> Closed: creator or staff closes / deadline
  Open --> Deleted: staff deletes
  Closed --> Deleted: staff deletes
```
