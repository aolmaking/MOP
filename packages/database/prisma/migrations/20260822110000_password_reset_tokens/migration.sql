-- Password reset tokens are separate from invite tokens: invite tokens
-- activate INVITED accounts, reset tokens recover existing accounts.
ALTER TABLE "accounts" ADD COLUMN "passwordResetTokenHash" TEXT;
ALTER TABLE "accounts" ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3);

CREATE INDEX "accounts_passwordResetTokenHash_idx" ON "accounts"("passwordResetTokenHash");
