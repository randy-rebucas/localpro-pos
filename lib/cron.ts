/**
 * Cron Job Service
 * Manages scheduled automation tasks
 * 
 * For Next.js deployments:
 * - Vercel: Use Vercel Cron Jobs (vercel.json)
 * - Self-hosted: Use node-cron (this file)
 * - External: Use external cron services (cron-job.org, EasyCron, etc.)
 */

import * as cron from 'node-cron';
import {
  sendBookingReminders,
  autoConfirmBookings,
  detectNoShows,
  sendLowStockAlerts,
  sendSalesReport,
  sendPendingReceipts,
  manageDiscountStatus, // eslint-disable-line @typescript-eslint/no-unused-vars
  autoClockOutForgottenSessions, // eslint-disable-line @typescript-eslint/no-unused-vars
  autoCloseCashDrawers, // eslint-disable-line @typescript-eslint/no-unused-vars
  sendCashCountReminders,
  detectAttendanceViolations,
  sendAbandonedCartReminders,
  detectBreaks,
  generatePurchaseOrders,
  createDatabaseBackup,
  cleanupAuditLogs,
  analyzeProductPerformance,
  calculateCustomerLifetimeValue,
  expireInactiveSessions, // eslint-disable-line @typescript-eslint/no-unused-vars
  detectStockImbalances,
  predictStockNeeds,
  applyDynamicPricing,
  archiveOldData,
  syncMultiBranchData,
  detectSuspiciousActivity,
  analyzeSalesTrends,
} from './automations';
import { logger } from '@/lib/logger';

let cronJobs: cron.ScheduledTask[] = [];

/**
 * Initialize cron jobs
 * Only runs in Node.js environment (not in Edge runtime)
 */
export function initializeCronJobs() {
  // Only run in server environment
  if (typeof window !== 'undefined' || process.env.NEXT_RUNTIME === 'edge') {
    return;
  }

  // Clear existing jobs
  stopCronJobs();

  logger.info('🕐 Initializing cron jobs...');

  // 1. Booking Reminders - Every hour
  // Runs at the top of every hour
  const bookingRemindersJob = cron.schedule('0 * * * *', async () => {
    logger.info('📅 Running booking reminders automation...');
    try {
      const result = await sendBookingReminders({ hoursBefore: 24 });
      logger.info('✅ Booking reminders:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Booking reminders error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 2. Low Stock Alerts - Every hour
  const lowStockJob = cron.schedule('0 * * * *', async () => {
    logger.info('📦 Running low stock alerts automation...');
    try {
      const result = await sendLowStockAlerts();
      logger.info('✅ Low stock alerts:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Low stock alerts error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 3. Daily Sales Report - End of day at 10 PM
  const dailyReportJob = cron.schedule('0 22 * * *', async () => {
    logger.info('📊 Running daily sales report automation...');
    try {
      const result = await sendSalesReport({ period: 'daily' });
      logger.info('✅ Daily sales report:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Daily sales report error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 4. Weekly Sales Report - Every Monday at 9 AM
  const weeklyReportJob = cron.schedule('0 9 * * 1', async () => {
    logger.info('📊 Running weekly sales report automation...');
    try {
      const result = await sendSalesReport({ period: 'weekly' });
      logger.info('✅ Weekly sales report:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Weekly sales report error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 5. Monthly Sales Report - 1st of month at 10 AM
  const monthlyReportJob = cron.schedule('0 10 1 * *', async () => {
    logger.info('📊 Running monthly sales report automation...');
    try {
      const result = await sendSalesReport({ period: 'monthly' });
      logger.info('✅ Monthly sales report:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Monthly sales report error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 6. Pending Receipts - Every 6 hours
  const pendingReceiptsJob = cron.schedule('0 */6 * * *', async () => {
    logger.info('📧 Running pending receipts automation...');
    try {
      const result = await sendPendingReceipts({ hoursAgo: 24 });
      logger.info('✅ Pending receipts:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Pending receipts error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 7. Discount Management - Every 6 hours
  const discountManagementJob = cron.schedule('0 */6 * * *', async () => {
    logger.info('💰 Running discount management automation...');
    try {
      const { manageDiscountStatus } = await import('./automations/discount-management');
      const result = await manageDiscountStatus();
      logger.info('✅ Discount management:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Discount management error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 8. Auto Clock-Out - Every 2 hours
  const autoClockOutJob = cron.schedule('0 */2 * * *', async () => {
    logger.info('⏰ Running auto clock-out automation...');
    try {
      const { autoClockOutForgottenSessions } = await import('./automations/attendance-auto-clockout');
      const result = await autoClockOutForgottenSessions();
      logger.info('✅ Auto clock-out:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Auto clock-out error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 9. Cash Drawer Auto-Close - Every day at 10 PM
  const cashDrawerCloseJob = cron.schedule('0 22 * * *', async () => {
    logger.info('💵 Running cash drawer auto-close automation...');
    try {
      const { autoCloseCashDrawers } = await import('./automations/cash-drawer-closure');
      const result = await autoCloseCashDrawers();
      logger.info('✅ Cash drawer auto-close:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Cash drawer auto-close error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 10. Booking Confirmations - Every 15 minutes
  const bookingConfirmJob = cron.schedule('*/15 * * * *', async () => {
    logger.info('✅ Running booking confirmations automation...');
    try {
      const result = await autoConfirmBookings();
      logger.info('✅ Booking confirmations:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Booking confirmations error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 11. No-Show Detection - Every 30 minutes
  const noShowJob = cron.schedule('*/30 * * * *', async () => {
    logger.info('🚫 Running no-show detection automation...');
    try {
      const result = await detectNoShows({ gracePeriodMinutes: 15 });
      logger.info('✅ No-show detection:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ No-show detection error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 12. Cash Count Reminders - Daily at 5 PM
  const cashCountReminderJob = cron.schedule('0 17 * * *', async () => {
    logger.info('💵 Running cash count reminders automation...');
    try {
      const result = await sendCashCountReminders({ reminderMinutesBefore: 30 });
      logger.info('✅ Cash count reminders:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Cash count reminders error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 13. Attendance Violations - Daily at 9 AM
  const attendanceViolationsJob = cron.schedule('0 9 * * *', async () => {
    logger.info('⏰ Running attendance violations automation...');
    try {
      const result = await detectAttendanceViolations({ lateThresholdMinutes: 15 });
      logger.info('✅ Attendance violations:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Attendance violations error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 14. Break Detection - Every 30 minutes
  const breakDetectionJob = cron.schedule('*/30 * * * *', async () => {
    logger.info('☕ Running break detection automation...');
    try {
      const result = await detectBreaks({ inactivityMinutes: 30 });
      logger.info('✅ Break detection:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Break detection error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 15. Abandoned Cart Reminders - Every 12 hours
  const abandonedCartJob = cron.schedule('0 */12 * * *', async () => {
    logger.info('🛒 Running abandoned cart reminders automation...');
    try {
      const result = await sendAbandonedCartReminders({ hoursAgo: 24 });
      logger.info('✅ Abandoned cart reminders:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Abandoned cart reminders error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 16. Purchase Order Generation - Daily at 9 AM
  const purchaseOrderJob = cron.schedule('0 9 * * *', async () => {
    logger.info('📋 Running purchase order generation automation...');
    try {
      const result = await generatePurchaseOrders();
      logger.info('✅ Purchase order generation:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Purchase order generation error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 17. Database Backups - Daily at 2 AM
  const backupJob = cron.schedule('0 2 * * *', async () => {
    logger.info('💾 Running database backup automation...');
    try {
      const result = await createDatabaseBackup();
      logger.info('✅ Database backup:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Database backup error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 18. Audit Log Cleanup - Weekly on Sunday at 4 AM
  const auditCleanupJob = cron.schedule('0 4 * * 0', async () => {
    logger.info('🧹 Running audit log cleanup automation...');
    try {
      const result = await cleanupAuditLogs({ retentionYears: 2 });
      logger.info('✅ Audit log cleanup:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Audit log cleanup error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 19. Product Performance - Weekly on Monday at 10 AM
  const productPerformanceJob = cron.schedule('0 10 * * 1', async () => {
    logger.info('📊 Running product performance automation...');
    try {
      const result = await analyzeProductPerformance({ daysToAnalyze: 30 });
      logger.info('✅ Product performance:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Product performance error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 20. Customer Lifetime Value - Weekly on Sunday at 2 AM
  const clvJob = cron.schedule('0 2 * * 0', async () => {
    logger.info('💰 Running customer lifetime value automation...');
    try {
      const result = await calculateCustomerLifetimeValue();
      logger.info('✅ Customer lifetime value:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Customer lifetime value error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 21. Session Expiration - Every 6 hours
  const sessionExpirationJob = cron.schedule('0 */6 * * *', async () => {
    logger.info('🔒 Running session expiration automation...');
    try {
      const { expireInactiveSessions } = await import('./automations/session-expiration');
      const result = await expireInactiveSessions({ inactivityHours: 24 });
      logger.info('✅ Session expiration:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Session expiration error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 22. Stock Transfer - Daily at 8 AM
  const stockTransferJob = cron.schedule('0 8 * * *', async () => {
    logger.info('📦 Running stock transfer automation...');
    try {
      const result = await detectStockImbalances({ autoApprove: false });
      logger.info('✅ Stock transfer:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Stock transfer error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 23. Predictive Stock - Weekly on Monday at 9 AM
  const predictiveStockJob = cron.schedule('0 9 * * 1', async () => {
    logger.info('🔮 Running predictive stock automation...');
    try {
      const result = await predictStockNeeds({ analysisDays: 30, predictionDays: 7 });
      logger.info('✅ Predictive stock:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Predictive stock error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 24. Dynamic Pricing - Every 30 minutes
  const dynamicPricingJob = cron.schedule('*/30 * * * *', async () => {
    logger.info('💲 Running dynamic pricing automation...');
    try {
      const result = await applyDynamicPricing({
        enableTimeBased: true,
        enableDemandBased: true,
        enableStockBased: true,
      });
      logger.info('✅ Dynamic pricing:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Dynamic pricing error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 25. Data Archiving - Weekly on Sunday at 3 AM
  const dataArchiveJob = cron.schedule('0 3 * * 0', async () => {
    logger.info('📚 Running data archiving automation...');
    try {
      const result = await archiveOldData({ archiveYears: 2 });
      logger.info('✅ Data archiving:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Data archiving error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 26. Multi-Branch Sync - Every 4 hours
  const multiBranchSyncJob = cron.schedule('0 */4 * * *', async () => {
    logger.info('🔄 Running multi-branch sync automation...');
    try {
      const result = await syncMultiBranchData();
      logger.info('✅ Multi-branch sync:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Multi-branch sync error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 27. Suspicious Activity - Every 15 minutes
  const suspiciousActivityJob = cron.schedule('*/15 * * * *', async () => {
    logger.info('🚨 Running suspicious activity detection automation...');
    try {
      const result = await detectSuspiciousActivity();
      logger.info('✅ Suspicious activity detection:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Suspicious activity detection error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 28. Sales Trend Analysis (Daily) - Daily at 9 AM
  const salesTrendDailyJob = cron.schedule('0 9 * * *', async () => {
    logger.info('📈 Running daily sales trend analysis automation...');
    try {
      const result = await analyzeSalesTrends({ period: 'daily', comparePeriods: true });
      logger.info('✅ Daily sales trend analysis:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Daily sales trend analysis error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 29. Sales Trend Analysis (Weekly) - Weekly on Monday at 10 AM
  const salesTrendWeeklyJob = cron.schedule('0 10 * * 1', async () => {
    logger.info('📈 Running weekly sales trend analysis automation...');
    try {
      const result = await analyzeSalesTrends({ period: 'weekly', comparePeriods: true });
      logger.info('✅ Weekly sales trend analysis:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Weekly sales trend analysis error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // 30. Sales Trend Analysis (Monthly) - Monthly on 1st at 11 AM
  const salesTrendMonthlyJob = cron.schedule('0 11 1 * *', async () => {
    logger.info('📈 Running monthly sales trend analysis automation...');
    try {
      const result = await analyzeSalesTrends({ period: 'monthly', comparePeriods: true });
      logger.info('✅ Monthly sales trend analysis:' + result.message);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('❌ Monthly sales trend analysis error:' + error.message);
    }
  }, {
    timezone: 'UTC',
  });

  // Store jobs
  cronJobs = [
    bookingRemindersJob,
    bookingConfirmJob,
    noShowJob,
    lowStockJob,
    purchaseOrderJob,
    dailyReportJob,
    weeklyReportJob,
    monthlyReportJob,
    pendingReceiptsJob,
    discountManagementJob,
    attendanceViolationsJob,
    breakDetectionJob,
    autoClockOutJob,
    cashDrawerCloseJob,
    cashCountReminderJob,
    abandonedCartJob,
    productPerformanceJob,
    clvJob,
    sessionExpirationJob,
    stockTransferJob,
    predictiveStockJob,
    dynamicPricingJob,
    dataArchiveJob,
    backupJob,
    auditCleanupJob,
    multiBranchSyncJob,
    suspiciousActivityJob,
    salesTrendDailyJob,
    salesTrendWeeklyJob,
    salesTrendMonthlyJob,
  ];

  // Start all jobs if enabled
  const cronEnabled = process.env.ENABLE_CRON_JOBS === 'true';
  if (cronEnabled) {
    cronJobs.forEach(job => job.start());
    logger.info(`✅ Started ${cronJobs.length} cron jobs`);
  } else {
    logger.info('⚠️  Cron jobs disabled (set ENABLE_CRON_JOBS=true to enable)');
  }
}

/**
 * Stop all cron jobs
 */
export function stopCronJobs() {
  cronJobs.forEach(job => job.stop());
  cronJobs = [];
  logger.info('🛑 Stopped all cron jobs');
}

/**
 * Get status of cron jobs
 */
export function getCronJobStatus() {
  return {
    enabled: process.env.ENABLE_CRON_JOBS === 'true',
    activeJobs: cronJobs.length,
    jobs: cronJobs.map((job, index) => ({
      index,
      running: job.getStatus() === 'scheduled',
    })),
  };
}
