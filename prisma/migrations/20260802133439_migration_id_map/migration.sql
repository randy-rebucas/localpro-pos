-- CreateTable
CREATE TABLE "_migration_id_map" (
    "collection" VARCHAR(64) NOT NULL,
    "mongo_id" VARCHAR(24) NOT NULL,
    "uuid" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_migration_id_map_pkey" PRIMARY KEY ("collection","mongo_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "_migration_id_map_uuid_key" ON "_migration_id_map"("uuid");
