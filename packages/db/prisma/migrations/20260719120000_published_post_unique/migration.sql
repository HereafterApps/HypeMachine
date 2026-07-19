-- One live post per content item (prevents double-publishing).
-- Defensive cleanup first: keep the earliest row per content id.
DELETE FROM "PublishedPost" a USING "PublishedPost" b
WHERE a."generatedContentId" = b."generatedContentId" AND a."createdAt" > b."createdAt";
CREATE UNIQUE INDEX "PublishedPost_generatedContentId_key" ON "PublishedPost"("generatedContentId");
