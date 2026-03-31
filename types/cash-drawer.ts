export interface CashDrawerSession {
  _id: string;
  userId: string | { _id: string; name: string; email: string };
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
