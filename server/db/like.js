'use strict';

/** LIKE pattern matching q literally as a substring; pair with ESCAPE '\\' in SQL. Shared by games + rankings (B259). */
const likeEscape = (q) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

module.exports = { likeEscape };
