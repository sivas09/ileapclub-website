-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'NOT_PAID');

-- CreateTable
CREATE TABLE "MonthlyMemberPayment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentMonth" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'NOT_PAID',
    "updatedByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyMemberPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyMemberPayment_studentId_paymentMonth_key" ON "MonthlyMemberPayment"("studentId", "paymentMonth");

-- CreateIndex
CREATE INDEX "MonthlyMemberPayment_paymentMonth_status_idx" ON "MonthlyMemberPayment"("paymentMonth", "status");

-- CreateIndex
CREATE INDEX "MonthlyMemberPayment_updatedByAdminId_idx" ON "MonthlyMemberPayment"("updatedByAdminId");

-- AddForeignKey
ALTER TABLE "MonthlyMemberPayment" ADD CONSTRAINT "MonthlyMemberPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyMemberPayment" ADD CONSTRAINT "MonthlyMemberPayment_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
