CREATE TABLE comments (
  id uuid PRIMARY KEY,
  poll_id uuid NOT NULL,
  parent_id uuid,
  body text,
  owner_token_hash text NOT NULL CHECK (owner_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  deleted_at timestamptz,
  UNIQUE (id, poll_id),
  FOREIGN KEY (parent_id, poll_id) REFERENCES comments(id, poll_id),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (
    (deleted_at IS NULL AND body IS NOT NULL AND char_length(body) BETWEEN 1 AND 2000 AND body ~ '[^[:space:]]')
    OR (deleted_at IS NOT NULL AND body IS NULL)
  )
);

CREATE INDEX comments_poll_created_idx ON comments(poll_id, created_at, id);

CREATE TABLE comment_reactions (
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  actor_token_hash text NOT NULL CHECK (actor_token_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('like', 'dislike')),
  PRIMARY KEY (comment_id, actor_token_hash)
);
