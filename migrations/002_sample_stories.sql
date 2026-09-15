INSERT OR IGNORE INTO stories (slug, title, description, likes)
VALUES ('last-train', 'The Last Train North', 'A station clock stops, but one train keeps moving.', 12);

INSERT INTO story_nodes (story_slug, parent_id, title, author, content)
SELECT 'last-train', NULL, 'Platform Zero', 'Mira',
       'At 00:17 every clock in the station stopped. Only the departure board continued to turn.'
WHERE NOT EXISTS (SELECT 1 FROM story_nodes WHERE story_slug = 'last-train');
