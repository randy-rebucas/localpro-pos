'use client';

import { useCallback, useEffect, useState } from 'react';

export interface InventoryBranch {
  _id: string;
  name: string;
  code?: string;
}

export interface StockPrediction {
  productId: string;
  name: string;
  image: string | null;
  category: string | null;
  currentStock: number;
  avgDailySales: number;
  daysUntilStockout: number;
}

export type FetchStatus = 'loading' | 'ready' | 'error';

export function useInventoryPage(tenant: string) {
  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [branchesStatus, setBranchesStatus] = useState<FetchStatus>('loading');
  const [branchesError, setBranchesError] = useState<string | null>(null);

  const [stockPredictions, setStockPredictions] = useState<StockPrediction[]>([]);
  const [predictionsStatus, setPredictionsStatus] = useState<FetchStatus>('loading');
  const [predictionsError, setPredictionsError] = useState<string | null>(null);

  const refetchBranches = useCallback(async () => {
    setBranchesStatus('loading');
    setBranchesError(null);
    try {
      const res = await fetch(`/api/branches?tenant=${tenant}&isActive=true`);
      const data = await res.json();
      if (data.success) {
        setBranches(data.data || []);
        setBranchesStatus('ready');
      } else {
        setBranches([]);
        setBranchesError(data.error || 'Failed to load branches');
        setBranchesStatus('error');
      }
    } catch (err) {
      console.error('Error fetching branches:', err);
      setBranches([]);
      setBranchesError('Failed to load branches');
      setBranchesStatus('error');
    }
  }, [tenant]);

  const refetchPredictions = useCallback(async () => {
    setPredictionsStatus('loading');
    setPredictionsError(null);
    try {
      const res = await fetch(`/api/insights/stock-predictions?tenant=${tenant}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setStockPredictions((data.data as StockPrediction[]) || []);
        setPredictionsStatus('ready');
      } else {
        setStockPredictions([]);
        setPredictionsError(data.error || 'Failed to load predictions');
        setPredictionsStatus('error');
      }
    } catch (err) {
      console.error('Error fetching stock predictions:', err);
      setStockPredictions([]);
      setPredictionsError('Failed to load predictions');
      setPredictionsStatus('error');
    }
  }, [tenant]);

  useEffect(() => {
    refetchBranches();
    refetchPredictions();
  }, [refetchBranches, refetchPredictions]);

  return {
    branches,
    branchesStatus,
    branchesError,
    refetchBranches,
    stockPredictions,
    predictionsStatus,
    predictionsError,
    refetchPredictions,
  };
}
