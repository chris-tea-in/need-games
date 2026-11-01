-- Retire the unread Surnex seed table (backlog D7, F11). Its 62 rows turned "high, low, low" ratings
-- into pure 100/0/0 scores, and no code reads them. data/surnex-dataset.csv stays as research input
-- for the scoring rubric in docs/MIMMA_RUBRIC.md.
DROP TRIGGER authoritative_mimma_seeds_prevent_insert;
--> statement-breakpoint

DROP TRIGGER authoritative_mimma_seeds_prevent_delete;
--> statement-breakpoint

DROP TRIGGER authoritative_mimma_seeds_prevent_update;
--> statement-breakpoint

DROP TABLE authoritative_mimma_seeds;
--> statement-breakpoint
