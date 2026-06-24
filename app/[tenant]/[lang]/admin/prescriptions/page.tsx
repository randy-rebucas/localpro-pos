'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { FileText, Plus, ChevronRight, CheckCircle, Clock, XCircle } from 'lucide-react';

interface PrescriptionItem {
  drugName: string;
  quantity: number;
  dosage: string;
  frequency: string;
  instructions?: string;
  dispensed: boolean;
  dispensedAt?: string;
}

interface Prescription {
  _id: string;
  prescriptionNumber: string;
  patientName: string;
  doctorName: string;
  doctorPRCNumber: string;
  issuedDate: string;
  validUntil: string;
  status: 'pending' | 'partially_dispensed' | 'dispensed' | 'expired' | 'cancelled';
  items: PrescriptionItem[];
  notes?: string;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  partially_dispensed: 'bg-blue-100 text-blue-800',
  dispensed: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  partially_dispensed: 'Partial',
  dispensed: 'Dispensed',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export default function PrescriptionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [dispensingIndexes, setDispensingIndexes] = useState<number[]>([]);
  const [dispensing, setDispensing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRx, setNewRx] = useState({
    patientName: '', patientAge: '', doctorName: '', doctorPRCNumber: '',
    doctorClinic: '', issuedDate: new Date().toISOString().split('T')[0],
    validUntil: '', notes: '',
    items: [{ drugName: '', quantity: 1, dosage: '', frequency: '', instructions: '' }],
  });
  const [creating, setCreating] = useState(false);

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/prescriptions${qs}`);
      const json = await res.json();
      if (json.success) setPrescriptions(json.data);
    } catch {
      toast.error('Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  const handleDispense = async () => {
    if (!selected || dispensingIndexes.length === 0) return;
    setDispensing(true);
    try {
      const res = await fetch(`/api/prescriptions/${selected._id}/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIndexes: dispensingIndexes }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Items dispensed successfully');
        setSelected(json.data);
        setDispensingIndexes([]);
        fetchPrescriptions();
      } else {
        toast.error(json.error || 'Dispense failed');
      }
    } catch {
      toast.error('Failed to dispense');
    } finally {
      setDispensing(false);
    }
  };

  const handleCreate = async () => {
    if (!newRx.patientName || !newRx.doctorName || !newRx.doctorPRCNumber || !newRx.validUntil) {
      toast.error('Please fill all required fields');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRx,
          patientAge: newRx.patientAge ? Number(newRx.patientAge) : undefined,
          items: newRx.items.filter(i => i.drugName.trim()),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Prescription ${json.data.prescriptionNumber} created`);
        setShowCreate(false);
        fetchPrescriptions();
      } else {
        toast.error(json.error || 'Failed to create');
      }
    } catch {
      toast.error('Failed to create prescription');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Prescriptions</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage and dispense Rx prescriptions</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> New Prescription
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-sm border transition-colors ${statusFilter === s ? 'bg-brand text-white border-brand-hover' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
          >
            {s === '' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* List */}
        <div className="bg-white border border-gray-300 divide-y divide-gray-100">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
                <p className="text-sm text-gray-400">Loading...</p>
              </div>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No prescriptions found</div>
          ) : prescriptions.map(rx => (
            <button
              key={rx._id}
              onClick={() => { setSelected(rx); setDispensingIndexes([]); }}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between transition-colors ${selected?._id === rx._id ? 'bg-brand/5' : ''}`}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{rx.prescriptionNumber}</p>
                <p className="text-xs text-gray-500">{rx.patientName} · Dr. {rx.doctorName}</p>
                <p className="text-xs text-gray-400">{new Date(rx.issuedDate).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 font-medium border ${STATUS_STYLES[rx.status]}`}>
                  {STATUS_LABEL[rx.status]}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        {selected && (
          <div className="bg-white border border-gray-300">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{selected.prescriptionNumber}</h2>
              <span className={`text-xs px-2 py-0.5 font-medium border ${STATUS_STYLES[selected.status]}`}>
                {STATUS_LABEL[selected.status]}
              </span>
            </div>
            <div className="p-5">
              <div className="text-sm text-gray-600 space-y-1 mb-4">
                <p><span className="font-medium">Patient:</span> {selected.patientName}</p>
                <p><span className="font-medium">Doctor:</span> Dr. {selected.doctorName} (PRC: {selected.doctorPRCNumber})</p>
                <p><span className="font-medium">Valid until:</span> {new Date(selected.validUntil).toLocaleDateString()}</p>
                {selected.notes && <p><span className="font-medium">Notes:</span> {selected.notes}</p>}
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-2 mb-4">
                {selected.items.map((item, idx) => (
                  <label key={idx} className={`flex items-start gap-3 p-3 border cursor-pointer ${item.dispensed ? 'bg-green-50 border-green-200' : 'border-gray-200'}`}>
                    {!item.dispensed && !['dispensed', 'expired', 'cancelled'].includes(selected.status) && (
                      <input
                        type="checkbox"
                        checked={dispensingIndexes.includes(idx)}
                        onChange={e => setDispensingIndexes(prev =>
                          e.target.checked ? [...prev, idx] : prev.filter(i => i !== idx)
                        )}
                        className="mt-0.5 w-4 h-4 accent-brand"
                      />
                    )}
                    {item.dispensed && <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />}
                    <div className="text-sm">
                      <p className="font-medium text-gray-800">{item.drugName}</p>
                      <p className="text-gray-500">{item.quantity} unit(s) · {item.dosage} · {item.frequency}</p>
                      {item.instructions && <p className="text-gray-400 text-xs">{item.instructions}</p>}
                      {item.dispensed && item.dispensedAt && (
                        <p className="text-green-600 text-xs">Dispensed {new Date(item.dispensedAt).toLocaleString()}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {!['dispensed', 'expired', 'cancelled'].includes(selected.status) && (
                <button
                  onClick={handleDispense}
                  disabled={dispensingIndexes.length === 0 || dispensing}
                  className="w-full py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  {dispensing ? 'Dispensing...' : `Dispense Selected (${dispensingIndexes.length})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">New Prescription</h2>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Patient Name *</label>
                  <input className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={newRx.patientName} onChange={e => setNewRx(s => ({ ...s, patientName: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Age</label>
                  <input type="number" className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={newRx.patientAge} onChange={e => setNewRx(s => ({ ...s, patientAge: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Doctor Name *</label>
                  <input className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={newRx.doctorName} onChange={e => setNewRx(s => ({ ...s, doctorName: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Doctor PRC No. *</label>
                  <input className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={newRx.doctorPRCNumber} onChange={e => setNewRx(s => ({ ...s, doctorPRCNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Issued Date</label>
                  <input type="date" className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={newRx.issuedDate} onChange={e => setNewRx(s => ({ ...s, issuedDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valid Until *</label>
                  <input type="date" className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={newRx.validUntil} onChange={e => setNewRx(s => ({ ...s, validUntil: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Clinic / Hospital</label>
                <input className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={newRx.doctorClinic} onChange={e => setNewRx(s => ({ ...s, doctorClinic: e.target.value }))} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">Drug Items</label>
                  <button onClick={() => setNewRx(s => ({ ...s, items: [...s.items, { drugName: '', quantity: 1, dosage: '', frequency: '', instructions: '' }] }))} className="text-xs font-medium text-brand hover:text-brand-hover">+ Add Item</button>
                </div>
                {newRx.items.map((item, idx) => (
                  <div key={idx} className="border border-gray-200 p-3 mb-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Drug name *" className="border border-gray-300 px-2 py-1.5 text-sm col-span-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={item.drugName} onChange={e => { const items = [...newRx.items]; items[idx].drugName = e.target.value; setNewRx(s => ({ ...s, items })); }} />
                      <input placeholder="Dosage e.g. 500mg" className="border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={item.dosage} onChange={e => { const items = [...newRx.items]; items[idx].dosage = e.target.value; setNewRx(s => ({ ...s, items })); }} />
                      <input placeholder="Frequency e.g. 3x daily" className="border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={item.frequency} onChange={e => { const items = [...newRx.items]; items[idx].frequency = e.target.value; setNewRx(s => ({ ...s, items })); }} />
                      <input type="number" min={1} placeholder="Qty" className="border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={item.quantity} onChange={e => { const items = [...newRx.items]; items[idx].quantity = Number(e.target.value); setNewRx(s => ({ ...s, items })); }} />
                      <input placeholder="Instructions (optional)" className="border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" value={item.instructions} onChange={e => { const items = [...newRx.items]; items[idx].instructions = e.target.value; setNewRx(s => ({ ...s, items })); }} />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" rows={2} value={newRx.notes} onChange={e => setNewRx(s => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={creating} className="px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors">
                {creating ? 'Creating...' : 'Create Prescription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
