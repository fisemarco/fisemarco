SET search_path = ftai_private, pg_catalog;
-- Existing conversations stay member-only. Only signed explicit public posts are displayed.
ALTER TABLE sphere_posts ADD COLUMN visibility text NOT NULL DEFAULT 'members' CHECK (visibility IN ('members','public'));
CREATE INDEX idx_sphere_posts_public ON sphere_posts(visibility,parent,created,id);
