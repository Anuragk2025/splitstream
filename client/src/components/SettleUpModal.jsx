import React, { useState, useEffect } from 'react';
import { X, Check, ArrowRight, AlertTriangle } from 'lucide-react';

function SettleUpModal({ isOpen, onClose, members, currentUser, onSave, prefilledFromId = null, prefilledToId = null, prefilledAmount = 0 }) {
  if (!isOpen) return null;

  const [fromUserId, setFromUserId] = useState(currentUser.id);
  const [toUserId, setToUserId] = useState('');
  const [amount, setAmount] = useState('');
  
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setFromUserId(prefilledFromId || currentUser.id);
    setToUserId(prefilledToId || '');
    setAmount(prefilledAmount > 0 ? prefilledAmount.toString() : '');
    setError('');
  }, [isOpen, prefilledFromId, prefilledToId, prefilledAmount, currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!toUserId) {
      setError('Please select who you are settling with.');
      return;
    }

    if (fromUserId === toUserId) {
      setError('You cannot settle a debt with yourself.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    try {
      setSubmitting(true);
      await onSave({
        fromUserId,
        toUserId,
        amount: parsedAmount,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record settlement.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter recipient list: can't settle with oneself
  const recipientOptions = members.filter(m => m.id !== fromUserId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md glass-panel glow-border-emerald rounded-3xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900 bg-slate-900/20">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-400" />
            Settle Balance
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-950/50 rounded-xl text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Flow Indicator */}
          <div className="flex items-center justify-center gap-4 py-3 bg-slate-900/30 rounded-2xl border border-slate-900/60">
            <div className="text-center">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Payer</span>
              <span className="text-sm font-bold text-slate-200">
                {members.find(m => m.id === fromUserId)?.name.split(' ')[0] || 'Select'}
              </span>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500" />
            <div className="text-center">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Receiver</span>
              <span className="text-sm font-bold text-brand-300">
                {members.find(m => m.id === toUserId)?.name.split(' ')[0] || 'Select'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Who is paying?</label>
            <select
              value={fromUserId}
              onChange={(e) => {
                setFromUserId(e.target.value);
                if (e.target.value === toUserId) setToUserId('');
              }}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl text-sm text-white focus:outline-none focus:border-brand-500 transition"
            >
              {members.map(m => (
                <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                  {m.name} {m.id === currentUser.id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Who is being paid?</label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl text-sm text-white focus:outline-none focus:border-brand-500 transition"
              required
            >
              <option value="" disabled className="bg-slate-900 text-slate-500">Select Recipient</option>
              {recipientOptions.map(m => (
                <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                  {m.name} {m.id === currentUser.id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Amount to Settle (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition"
              required
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-2xl text-xs text-slate-300 font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-xs text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition"
            >
              {submitting ? 'Recording...' : 'Record Settlement'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

export default SettleUpModal;
