-- What the vehicle actually is.
--
-- Nullable on purpose: every existing asset was registered without a make,
-- and inventing one would be worse than the absence -- the fitment engine
-- already guessed a make from letters in the plate number, and the parts a
-- technician was offered followed that guess.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "make" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "modelYear" INTEGER;
