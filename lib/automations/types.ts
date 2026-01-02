/**
 * Types for automation system
 */

export interface AutomationResult {
  success: boolean;
  message: string;
  processed: number;
  failed: number;
  errors?: string[];
}

export interface TenantAutomationConfig {
  tenantId: string;
  tenantSlug: string;
  enabled: boolean;
  settings?: Record<string, any>;
}
