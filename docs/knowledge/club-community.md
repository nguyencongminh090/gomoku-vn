---
name: club-community
domain: gomoku-vn
apply_when: "Designing club moderation, message composition, or team competition"
confidence: high
last_reviewed: 2026-11-25
---
# Club community design

Discord gives moderators a timed restriction on participation. Rocket.Chat assigns permissions by role and scope. For clubs, check a current membership at the point of mutation and store expiry as an absolute timestamp so restarts preserve it. [Discord timeouts](https://support.discord.com/hc/en-us/articles/4413305239191-Time-Out-FAQ) · [Rocket.Chat permissions](https://docs.rocket.chat/docs/permissions)

Discourse routes flagged posts to a review queue where staff choose a disposition. Keep reporter identity private, deduplicate reports and record the person who resolves them. [Discourse flags](https://meta.discourse.org/t/understanding-post-flags-in-discourse/275)

Zulip exposes individual and group mentions in the composer. Mattermost attaches argument hints and descriptions to command triggers. Slack collects structured inputs in focused dialogs and can publish the result into a conversation. Reuse the club composer for discovery and show a preview before creating an event or poll. [Zulip mentions](https://zulip.com/help/mention-a-user-or-group) · [Mattermost commands](https://developers.mattermost.com/integrate/slash-commands/custom/) · [Slack modals](https://docs.slack.dev/surfaces/modals/)

Lichess provides a team directory. Chess.com club matches pair members by board order and aggregate results. Put team events on the existing competition channel and freeze board order at start so a rating change cannot alter a pairing. [Lichess teams](https://lichess.org/team) · [Chess.com club matches](https://support.chess.com/en/articles/8649115-what-are-club-matches)

Use for community interactions. Game rules, persistence and scoring follow the local tournament engine.
