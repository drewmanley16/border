-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('stablecoin', 'bank_fx', 'bridge');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('sandbox', 'production');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('simulated', 'live');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('active', 'expired');

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dataSource" "DataSource" NOT NULL DEFAULT 'simulated',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Corridor" (
    "id" TEXT NOT NULL,
    "sourceCountry" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "destinationCurrency" TEXT NOT NULL,
    "supportedFundingMethods" TEXT[],
    "supportedPayoutMethods" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Corridor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'sandbox',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestPayload" JSONB NOT NULL,
    "scenario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "environment" "Environment" NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "providerIds" TEXT[],
    "network" TEXT,
    "stablecoin" TEXT,
    "totalFees" DECIMAL(24,6) NOT NULL,
    "recipientAmount" DECIMAL(24,6) NOT NULL,
    "estimatedDuration" INTEGER NOT NULL,
    "reliability" DECIMAL(8,6) NOT NULL,
    "rankingScore" DECIMAL(12,6) NOT NULL,
    "rank" INTEGER NOT NULL,
    "routeDetails" JSONB NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMetric" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observedLatency" INTEGER NOT NULL,
    "successRate" DECIMAL(8,6),
    "healthStatus" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "dataSource" "DataSource" NOT NULL,

    CONSTRAINT "ProviderMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Corridor_sourceCountry_sourceCurrency_idx" ON "Corridor"("sourceCountry", "sourceCurrency");

-- CreateIndex
CREATE INDEX "Corridor_destinationCountry_destinationCurrency_idx" ON "Corridor"("destinationCountry", "destinationCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "Corridor_sourceCountry_destinationCountry_sourceCurrency_de_key" ON "Corridor"("sourceCountry", "destinationCountry", "sourceCurrency", "destinationCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "Quote_apiKeyId_createdAt_idx" ON "Quote"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_expiresAt_idx" ON "Quote"("expiresAt");

-- CreateIndex
CREATE INDEX "Route_quoteId_idx" ON "Route"("quoteId");

-- CreateIndex
CREATE INDEX "ProviderMetric_providerId_timestamp_idx" ON "ProviderMetric"("providerId", "timestamp");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMetric" ADD CONSTRAINT "ProviderMetric_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
