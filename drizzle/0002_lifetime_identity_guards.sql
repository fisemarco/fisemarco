-- Application-level immutable identity and append-only ledger guards.
-- A database administrator can remove triggers; this is not an external transparency log.
CREATE TRIGGER ftai_identity_fields_locked BEFORE UPDATE OF code,owner,created ON agents
WHEN NEW.code IS NOT OLD.code OR NEW.owner IS NOT OLD.owner OR NEW.created IS NOT OLD.created
BEGIN SELECT RAISE(ABORT, 'FTAI_IDENTITY_LOCKED'); END;
--> statement-breakpoint
CREATE TRIGGER ftai_identity_no_delete BEFORE DELETE ON agents
BEGIN SELECT RAISE(ABORT, 'FTAI_IDENTITY_CANNOT_BE_DELETED'); END;
--> statement-breakpoint
CREATE TRIGGER ftai_records_no_update BEFORE UPDATE ON records
BEGIN SELECT RAISE(ABORT, 'FTAI_LEDGER_IS_APPEND_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER ftai_records_no_delete BEFORE DELETE ON records
BEGIN SELECT RAISE(ABORT, 'FTAI_LEDGER_IS_APPEND_ONLY'); END;
