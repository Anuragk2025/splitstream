import React, { useState, useEffect } from 'react';
import { X, Check, DollarSign, Percent, Plus, Minus, AlertTriangle } from 'lucide-react';

function AddExpenseModal({ isOpen, onClose, members, currentUser, onSave, expenseToEdit = null }) {
  if (!isOpen) return null;

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidById, setPaidById] = useState(currentUser.id);
  const [splitType, setSplitType] = useState('EQUAL');
  
  // Custom split values: { userId: number }
  const [splitInputs, setSplitInputs] = useState({});
  // Included members for EQUAL split (defaults to everyone)
  const [includedUsers, setIncludedUsers] = useState({});
  
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (expenseToEdit) {
      setDescription(expenseToEdit.description);
      setAmount(expenseToEdit.amount.toString());
      setPaidById(expenseToEdit.paidById);
      setSplitType(expenseToEdit.splitType);
      
      const inputs = {};
      const included = {};
      
      // Initialize inputs from existing splits
      members.forEach(m => {
        const existingSplit = expenseToEdit.splits.find(s => s.userId === m.id);
        if (existingSplit) {
          included[m.id] = true;
          if (expenseToEdit.splitType === 'EXACT') {
            inputs[m.id] = existingSplit.amountOwed;
          } else {
            // For other types, we'll try to map value (or default)
            inputs[m.id] = existingSplit.amountOwed; // fallback
          }
        } else {
          included[m.id] = false;
          inputs[m.id] = 0;
        }
      });
      
      // If percentage or shares, we need to map back values if we stored them
      // (For simplicity in editing, we can let user re-input or store split config.
      // We will let the edit populate their dollar values or reset to defaults depending on type).
      setSplitInputs(inputs);
      setIncludedUsers(included);
    } else {
      // Default initialization for new expense
      setDescription('');
      setAmount('');
      setPaidById(currentUser.id);
      setSplitType('EQUAL');
      
      const inputs = {};
      const included = {};
      members.forEach(m => {
        inputs[m.id] = 1; // default share is 1, percentage is 0
        included[m.id] = true; // default include everyone in equal split
      });
      setSplitInputs(inputs);
      setIncludedUsers(included);
    }
    setError('');
  }, [expenseToEdit, isOpen, members, currentUser]);

  // Adjust defaults when split type changes
  const handleSplitTypeChange = (type) => {
    setSplitType(type);
    const inputs = {};
    members.forEach(m => {
      if (type === 'EQUAL') {
        inputs[m.id] = 1;
      } else if (type === 'PERCENTAGE') {
        // Equal split percentage
        inputs[m.id] = Math.round((100 / members.length) * 100) / 100;
      } else if (type === 'EXACT') {
        inputs[m.id] = 0;
      } else if (type === 'SHARES') {
        inputs[m.id] = 1;
      }
    });
    setSplitInputs(inputs);
  };

  const handleInputChange = (userId, val) => {
    const floatVal = parseFloat(val);
    setSplitInputs(prev => ({
      ...prev,
      [userId]: isNaN(floatVal) ? 0 : floatVal
    }));
  };

  const toggleUserInclusion = (userId) => {
    setIncludedUsers(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const getLiveCalculatedOwed = (userId) => {
    const parsedAmount = parseFloat(amount) || 0;
    if (parsedAmount <= 0) return 0;

    if (splitType === 'EQUAL') {
      const activeCount = Object.values(includedUsers).filter(Boolean).length;
      if (activeCount === 0 || !includedUsers[userId]) return 0;
      return Math.round((parsedAmount / activeCount) * 100) / 100;
    } else if (splitType === 'PERCENTAGE') {
      const pct = splitInputs[userId] || 0;
      return Math.round((parsedAmount * (pct / 100)) * 100) / 100;
    } else if (splitType === 'EXACT') {
      return splitInputs[userId] || 0;
    } else if (splitType === 'SHARES') {
      const shares = splitInputs[userId] || 0;
      const totalShares = Object.entries(splitInputs)
        .reduce((sum, [uid, s]) => sum + (s || 0), 0);
      if (totalShares === 0 || shares <= 0) return 0;
      return Math.round((parsedAmount * (shares / totalShares)) * 100) / 100;
    }
    return 0;
  };

  const validateAndSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    if (!description.trim()) {
      setError('Description is required.');
      return;
    }

    let payloadSplits = [];

    if (splitType === 'EQUAL') {
      const activeMembers = Object.entries(includedUsers)
        .filter(([_, included]) => included)
        .map(([userId]) => userId);

      if (activeMembers.length === 0) {
        setError('At least one member must be selected for equal split.');
        return;
      }

      payloadSplits = activeMembers.map(userId => ({ userId }));
    } else if (splitType === 'PERCENTAGE') {
      let sumPct = 0;
      const inputs = Object.entries(splitInputs).map(([userId, val]) => {
        sumPct += val;
        return { userId, value: val };
      });

      if (Math.abs(sumPct - 100) > 0.05) {
        setError(`Percentages must sum to 100%. Current sum: ${sumPct.toFixed(1)}%`);
        return;
      }

      payloadSplits = inputs.filter(item => item.value > 0);
    } else if (splitType === 'EXACT') {
      let sumExact = 0;
      const inputs = Object.entries(splitInputs).map(([userId, val]) => {
        sumExact += val;
        return { userId, value: val };
      });

      if (Math.abs(sumExact - parsedAmount) > 0.05) {
        setError(`Sum of exact split amounts (₹${sumExact.toFixed(2)}) must equal total amount (₹${parsedAmount.toFixed(2)})`);
        return;
      }

      payloadSplits = inputs.filter(item => item.value > 0);
    } else if (splitType === 'SHARES') {
      let totalShares = 0;
      const inputs = Object.entries(splitInputs).map(([userId, val]) => {
        totalShares += val;
        return { userId, value: val };
      });

      if (totalShares <= 0) {
        setError('Total shares count must be greater than 0.');
        return;
      }

      payloadSplits = inputs.filter(item => item.value > 0);
    }

    try {
      setSubmitting(true);
      await onSave({
        id: expenseToEdit?.id,
        amount: parsedAmount,
        description,
        paidById,
        splitType,
        splits: payloadSplits,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-xl glass-panel glow-border-purple rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900 bg-slate-900/20">
          <h3 className="text-xl font-bold text-white">
            {expenseToEdit ? 'Edit Expense' : 'Add New Expense'}
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-950/50 rounded-xl text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={validateAndSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Core Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Dinner, Rent, Groceries"
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Total Amount (₹)</label>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Who Paid?</label>
              <select
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
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
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Split Strategy</label>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-900/60 rounded-2xl border border-slate-900">
                {['EQUAL', 'PERCENTAGE', 'EXACT', 'SHARES'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSplitTypeChange(type)}
                    className={`py-2 text-[10px] font-bold rounded-xl text-center transition ${
                      splitType === type 
                        ? 'bg-brand-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Splitting Details Config */}
          <div className="border-t border-slate-900 pt-6">
            <h4 className="font-bold text-sm text-slate-200 mb-4 flex items-center justify-between">
              <span>Split Details Breakdown</span>
              {splitType === 'PERCENTAGE' && (
                <span className="text-xs text-brand-400 font-semibold">
                  Total: {Object.values(splitInputs).reduce((sum, v) => sum + (v || 0), 0).toFixed(1)}% / 100%
                </span>
              )}
              {splitType === 'EXACT' && (
                <span className="text-xs text-brand-400 font-semibold">
                  Total: ₹{Object.values(splitInputs).reduce((sum, v) => sum + (v || 0), 0).toFixed(2)} / ₹{parseFloat(amount) || 0}
                </span>
              )}
            </h4>

            <div className="space-y-3">
              {members.map((member) => {
                const calculatedOwed = getLiveCalculatedOwed(member.id);
                const isPayer = member.id === paidById;

                return (
                  <div 
                    key={member.id}
                    className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      splitType === 'EQUAL' && !includedUsers[member.id]
                        ? 'bg-slate-950/20 border-slate-900/40 opacity-40'
                        : 'bg-slate-900/10 border-slate-900/80 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {splitType === 'EQUAL' ? (
                        <button
                          type="button"
                          onClick={() => toggleUserInclusion(member.id)}
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                            includedUsers[member.id]
                              ? 'bg-brand-600 border-brand-500 text-white'
                              : 'border-slate-700 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-brand-500"></div>
                      )}
                      <div>
                        <span className="text-sm font-semibold text-white">
                          {member.name} {member.id === currentUser.id ? '(You)' : ''}
                        </span>
                        {isPayer && (
                          <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                            Payer
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Input Field / Live Calculations per Member */}
                    <div className="flex items-center gap-4">
                      {splitType === 'PERCENTAGE' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={splitInputs[member.id] || ''}
                            onChange={(e) => handleInputChange(member.id, e.target.value)}
                            placeholder="0"
                            className="w-20 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white text-right focus:outline-none focus:border-brand-500"
                          />
                          <Percent className="w-4 h-4 text-slate-500" />
                        </div>
                      )}

                      {splitType === 'EXACT' && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-xs">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={splitInputs[member.id] || ''}
                            onChange={(e) => handleInputChange(member.id, e.target.value)}
                            placeholder="0.00"
                            className="w-24 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white text-right focus:outline-none focus:border-brand-500"
                          />
                        </div>
                      )}

                      {splitType === 'SHARES' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={splitInputs[member.id] || ''}
                            onChange={(e) => handleInputChange(member.id, e.target.value)}
                            placeholder="1"
                            className="w-16 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white text-right focus:outline-none focus:border-brand-500"
                          />
                          <span className="text-slate-500 text-xs">shares</span>
                        </div>
                      )}

                      {/* Display computed amount member owes */}
                      <div className="text-right min-w-[70px]">
                        <span className="text-slate-500 text-[10px] block font-medium">Owes</span>
                        <span className="text-sm font-bold text-slate-200">₹{calculatedOwed.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-900 bg-slate-900/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-2xl text-xs text-slate-300 font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={validateAndSubmit}
            disabled={submitting}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-brand-850 text-xs text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition"
          >
            {submitting ? 'Saving...' : 'Save Expense'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default AddExpenseModal;
