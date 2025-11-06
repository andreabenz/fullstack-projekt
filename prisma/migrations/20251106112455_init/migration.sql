-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(10),
    "tag" VARCHAR(5),
    "content" TEXT,
    "createdAt" TIME(6),
    "updatedAt" TIME(6),

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);
