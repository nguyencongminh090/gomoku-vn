-- B475: club chat edit/delete own messages. ADD COLUMN only (kind CHECK unchanged → no rebuild).
-- clubs.chat_rev: per-club counter, +1 inside every edit transaction; clients poll `&rev=n` for rows with edit_rev > n.
-- Never derive the cursor from max(edit_rev): a trim or delete of that row would let the next edit reuse a passed rev.
ALTER TABLE club_messages ADD COLUMN edited_at TEXT;
ALTER TABLE club_messages ADD COLUMN edit_rev INTEGER;
ALTER TABLE clubs ADD COLUMN chat_rev INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_club_messages_rev ON club_messages(club_id, edit_rev) WHERE edit_rev IS NOT NULL;

-- Last 5 prior bodies per message: evidence for reports only (never shown to members); cascades with the message.
CREATE TABLE club_message_edits (
  message_id INTEGER NOT NULL REFERENCES club_messages(id) ON DELETE CASCADE,
  body TEXT NOT NULL, edited_at TEXT NOT NULL
);
CREATE INDEX idx_club_message_edits_msg ON club_message_edits(message_id);

-- prior: JSON [{body, editedAt}] snapshotted at report time. later: JSON {action:'edited'|'deleted', body?, at}.
ALTER TABLE club_reports ADD COLUMN prior TEXT;
ALTER TABLE club_reports ADD COLUMN later TEXT;
