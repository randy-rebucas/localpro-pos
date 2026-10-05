export interface CashDrawerSession {
  id: string;
  userId: string;
  user?: { name: string; email: string } | null;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  shortage?: number;
  overage?: number;
  openingTime: string;
  closingTime?: string;
  status: 'open' | 'closed';
  notes?: string;
  totalVAT?: number;
  totalDiscounts?: number;
  createdAt: string;
}
