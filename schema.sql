CREATE TYPE "VoteType" AS ENUM ('DOWN', 'UP');
--
CREATE TABLE "Host" (
    "id" SERIAL PRIMARY KEY,
    --delete prompt: members, ratings, reviews, comments ON EACH IF ANY
    "description" text NOT NULL,
    "name" text NOT NULL,
    "ownerUserId" text NOT NULL UNIQUE,
    "site" text NOT NULL,
    "createdAt" date NOT NULL DEFAULT CURRENT_DATE,
    "isSuspended" boolean DEFAULT FALSE
);
CREATE TABLE "HostMember" (
    --check if already in "Host" as the owner
    "userId" text PRIMARY KEY,
    "hostId" integer NOT NULL REFERENCES "Host" ON DELETE CASCADE
);
-- CREATE TABLE "OverallRating" (
--     "hostId" integer NOT NULL REFERENCES "Host" ON DELETE CASCADE,
--     "general" Decimal(1, 0) NOT NULL,
--     "billing" Decimal(1, 0),
--     "cpu" Decimal(1, 0),
--     "ram" Decimal(1, 0),
--     "support" Decimal(1, 0)
-- );
CREATE TABLE "UserRating" (
    "ratingId" SERIAL PRIMARY KEY,
    -- delete prompt: review with karma, comments ON EACH IF ANY
    "hostId" integer NOT NULL REFERENCES "Host" ON DELETE CASCADE,
    "userId" text NOT NULL,
    "general" Decimal(1, 0) NOT NULL,
    "billing" Decimal(1, 0),
    "cpu" Decimal(1, 0),
    "ram" Decimal(1, 0),
    "support" Decimal(1, 0),
    UNIQUE ("hostId", "userId")
);
CREATE TABLE "UserReview" (
    -- delete prompt: karma, comments
    "ratingId" integer PRIMARY KEY REFERENCES "UserRating"("ratingId") ON DELETE CASCADE,
    "text" text NOT NULL,
    "karma" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3)
);
CREATE TABLE "UserReviewVote" (
    "ratingId" integer REFERENCES "UserReview" ON DELETE CASCADE,
    "userId" text,
    "voteType" "VoteType" NOT NULL,
    PRIMARY KEY("ratingId", "userId")
);
CREATE TABLE "UserComment" (
    "commentId" SERIAL PRIMARY KEY,
    "ratingId" integer NOT NULL REFERENCES "UserReview" ON DELETE CASCADE,
    "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3),
    "text" text NOT NULL,
    "toCommentId" integer,
    "userId" text NOT NULL,
    "karma" integer NOT NULL DEFAULT 0
);
--response to review
CREATE TABLE "HosterResponse" (
    "ratingId" integer PRIMARY KEY,
    "commentId" integer NOT NULL REFERENCES "UserComment" ON DELETE CASCADE
);
CREATE TABLE "UserCommentVote" (
    "commentId" integer REFERENCES "UserComment" ON DELETE CASCADE,
    "userId" text,
    "voteType" "VoteType" NOT NULL,
    PRIMARY KEY("commentId", "userId")
);