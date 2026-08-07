/*
  Warnings:

  - Added the required column `currency` to the `tenants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timezone` to the `tenants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "currency" TEXT NOT NULL,
ADD COLUMN     "timezone" TEXT NOT NULL;
