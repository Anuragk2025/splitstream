import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import AddExpenseModal from '../components/AddExpenseModal';
import SettleUpModal from '../components/SettleUpModal';
import { 
  ArrowLeft, Plus, Check, DollarSign, Calendar, Copy, CheckCircle, 
  Trash2, Edit, AlertCircle, Users, Activity, CornerDownRight, RefreshCcw
} from 'lucide-react';

function GroupDetails() {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { socket, isConnected } = useSocket();

  // Data State
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [whoOwesWhom, setWhoOwesWhom] = useState([]);
  const [userNetBalance, setUserNetBalance] = useState(0);
  const [activityFeed, setActivityFeed] = useState([]);

  // UI loading/error state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [eventNotification, setEventNotification] = useState(null);

  // Modals state
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [isSettleOpen, setIsSettleOpen] = useState(false);

  // Settle up prefill details
  const [settlePrefill, setSettlePrefill] = useState({
    fromId: null,
    toId: null,
    amount: 0
  });

  const timerRef = useRef(null);

  const fetchGroupDetails = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      const data = await res.json();

      if (res.ok) {
        setGroup(data.group);
        setMembers(data.members);
        setExpenses(data.expenses);
        setSettlements(data.settlements);
        setWhoOwesWhom(data.whoOwesWhom);
        setUserNetBalance(data.userNetBalance);
      } else {
        setError(data.message || 'Failed to load group details.');
      }
    } catch (err) {
      console.error('Fetch group details error:', err);
      setError('Connection error. Failed to load group details.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchActivityFeed = async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/activity`);
      if (res.ok) {
        const data = await res.json();
        setActivityFeed(data.activities);
      }
    } catch (err) {
      console.error('Fetch activity feed error:', err);
    }
  };

  // 1. Initial Load & Socket Room Setup
  useEffect(() => {
    fetchGroupDetails();
    fetchActivityFeed();

    if (socket) {
      // Join Socket Room
      socket.emit('join_group', groupId);

      // Listen for updates broadcasted by server
      socket.on('group_updated', (event) => {
        console.log('Group updated event:', event);
        
        // Show real-time activity alert banner
        setEventNotification(event.message);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setEventNotification(null);
        }, 5000);

        // Instantly sync data using server state
        fetchGroupDetails(true);
        fetchActivityFeed();
      });

      // Handle reconnect event: fetch all details to avoid missed events
      socket.on('connect', () => {
        console.log('Socket reconnected in GroupDetails - re-joining room and re-fetching details');
        socket.emit('join_group', groupId);
        fetchGroupDetails(true);
        fetchActivityFeed();
      });
    }

    return () => {
      if (socket) {
        socket.emit('leave_group', groupId);
        socket.off('group_updated');
        socket.off('connect');
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [groupId, socket]);

  // Copy Invite Code Helper
  const handleCopyInvite = () => {
    if (group?.inviteCode) {
      navigator.clipboard.writeText(group.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Save Expense Handler (Create/Edit)
  const handleSaveExpense = async (expenseData) => {
    const isEdit = !!expenseData.id;
    const url = isEdit ? `/api/expenses/${expenseData.id}` : '/api/expenses';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        amount: expenseData.amount,
        description: expenseData.description,
        paidById: expenseData.paidById,
        splitType: expenseData.splitType,
        splits: expenseData.splits,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to save expense.');
    }
    
    // Refresh details after successful operation (Sockets also handle broadcast)
    fetchGroupDetails(true);
    fetchActivityFeed();
  };

  // Delete Expense Handler
  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        fetchGroupDetails(true);
        fetchActivityFeed();
      } else {
        alert(data.message || 'Failed to delete expense.');
      }
    } catch (err) {
      alert('Connection error. Failed to delete expense.');
    }
  };

  // Save Settlement Handler
  const handleSaveSettlement = async (settlementData) => {
    const res = await fetch('/api/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        toUserId: settlementData.toUserId,
        amount: settlementData.amount,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to record settlement.');
    }

    fetchGroupDetails(true);
    fetchActivityFeed();
  };

  const triggerSettleUpPrefilled = (fromId, toId, amount) => {
    setSettlePrefill({ fromId, toId, amount });
    setIsSettleOpen(true);
  };

  // Avatar generator helper
  const getAvatarInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-brand-400">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <AlertCircle className="w-16 h-16 text-rose-500 mb-4" />
        <h3 className="text-xl font-bold mb-2">Error Loading Group</h3>
        <p className="text-slate-400 mb-6 text-center max-w-md">{error}</p>
        <Link to="/" className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-2xl text-sm font-semibold flex items-center gap-2 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 relative overflow-hidden">
      
      {/* Realtime Alert Banner */}
      {eventNotification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 bg-brand-900/90 backdrop-blur border border-brand-500 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce max-w-sm sm:max-w-md">
          <Activity className="w-5 h-5 text-brand-400 shrink-0 animate-pulse" />
          <span className="text-xs font-bold text-white leading-relaxed">{eventNotification}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')}
              className="p-2 rounded-xl hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-white leading-none">{group?.name}</h1>
              <span className="text-[10px] text-slate-500 mt-1 block">SplitStream collaboration room</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Invite Code Share */}
            <button 
              onClick={handleCopyInvite}
              className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-xs flex items-center gap-2 text-slate-300 font-semibold transition"
            >
              <span className="text-slate-500">Code:</span>
              <span className="text-brand-400 font-mono tracking-wider">{group?.inviteCode}</span>
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            </button>

            {/* Socket Status Indicator */}
            <div 
              title={isConnected ? 'Real-time connected' : 'Offline / Reconnecting'}
              className={`w-3 h-3 rounded-full border border-slate-950 ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] animate-ping'}`}
            ></div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 mt-8">
        
        {/* Net Balance Overview Panel */}
        <div className={`p-6 rounded-3xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${
          userNetBalance > 0 
            ? 'glow-border-emerald bg-emerald-950/5'
            : userNetBalance < 0 
              ? 'glow-border-rose bg-rose-950/5'
              : 'bg-slate-900/10 border border-slate-900'
        }`}>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Your Group Balance</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`text-3xl font-extrabold ${
                userNetBalance > 0 ? 'text-emerald-400' : userNetBalance < 0 ? 'text-rose-400' : 'text-slate-300'
              }`}>
                {userNetBalance > 0 ? `+₹${userNetBalance.toFixed(2)}` : userNetBalance < 0 ? `-₹${Math.abs(userNetBalance).toFixed(2)}` : '₹0.00'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {userNetBalance > 0 
                ? 'You are owed money overall in this group.' 
                : userNetBalance < 0 
                  ? 'You owe money overall in this group.' 
                  : 'You are all settled up with everyone! 🎉'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setSettlePrefill({ fromId: currentUser.id, toId: '', amount: 0 });
                setIsSettleOpen(true);
              }}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white rounded-2xl flex items-center gap-2 shadow-lg shadow-emerald-600/10 transition-all"
            >
              <Check className="w-4 h-4" /> Settle Up
            </button>
            <button 
              onClick={() => {
                setExpenseToEdit(null);
                setIsExpenseOpen(true);
              }}
              className="px-5 py-3 bg-brand-600 hover:bg-brand-500 text-xs font-bold text-white rounded-2xl flex items-center gap-2 shadow-lg shadow-brand-600/10 transition-all"
            >
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          </div>
        </div>

        {/* 3-Column Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Column 1: Debt Simplification */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
              <CornerDownRight className="w-5 h-5 text-emerald-400" />
              Simplified Settlement Plan
            </h3>

            <div className="glass-panel p-5 rounded-3xl border border-slate-900 min-h-[160px] space-y-4">
              {whoOwesWhom.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mb-2" />
                  <p className="text-xs text-slate-400 font-bold">No Pending Debts</p>
                  <p className="text-[10px] text-slate-500 mt-1">Everyone is completely settled up.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {whoOwesWhom.map((tx, idx) => {
                    const isCurrentUserDebtor = tx.fromId === currentUser.id;
                    const isCurrentUserCreditor = tx.toId === currentUser.id;

                    return (
                      <div 
                        key={idx}
                        className="p-3.5 bg-slate-950/40 border border-slate-900 rounded-2xl flex items-center justify-between gap-4 hover:border-slate-800 transition"
                      >
                        <div className="text-xs">
                          <span className={`font-bold ${isCurrentUserDebtor ? 'text-rose-400' : 'text-slate-300'}`}>
                            {isCurrentUserDebtor ? 'You' : tx.fromName}
                          </span>
                          <span className="text-slate-500 px-1 font-medium">owes</span>
                          <span className={`font-bold ${isCurrentUserCreditor ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {isCurrentUserCreditor ? 'You' : tx.toName}
                          </span>
                          <span className="block font-bold text-slate-200 mt-1 text-sm">
                            ₹{tx.amount.toFixed(2)}
                          </span>
                        </div>

                        {/* Quick pay button for debtor */}
                        {isCurrentUserDebtor && (
                          <button
                            onClick={() => triggerSettleUpPrefilled(tx.fromId, tx.toId, tx.amount)}
                            className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500 text-[10px] font-bold text-emerald-400 hover:text-white rounded-xl transition"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Recent Expenses Feed */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
              <DollarSign className="w-5 h-5 text-brand-400" />
              Recent Expenses
            </h3>

            <div className="space-y-4">
              {expenses.length === 0 ? (
                <div className="glass-panel p-8 rounded-3xl border border-slate-900 text-center text-slate-500 text-xs">
                  No expenses added yet. Click "Add Expense" to get started!
                </div>
              ) : (
                expenses.map((expense) => {
                  const wasAddedByCurrentUser = expense.paidById === currentUser.id;
                  const currentUserSplit = expense.splits.find(s => s.userId === currentUser.id);

                  return (
                    <div 
                      key={expense.id}
                      className="glass-panel p-5 rounded-3xl border border-slate-900 hover:border-slate-800 transition flex flex-col gap-4 relative group"
                    >
                      {/* Top Row: Description & Amount */}
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h4 className="font-extrabold text-base text-white leading-tight">
                            {expense.description}
                          </h4>
                          <span className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(expense.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                            Paid by <strong className="text-slate-400 font-semibold">{expense.paidBy.name.split(' ')[0]}</strong>
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-white">₹{expense.amount.toFixed(2)}</span>
                          {/* Display what user owes for this specific expense */}
                          {currentUserSplit && (
                            <span className="block text-[9px] text-slate-500 font-medium">
                              {wasAddedByCurrentUser 
                                ? `You lent ₹${(expense.amount - currentUserSplit.amountOwed).toFixed(2)}` 
                                : `You owe ₹${currentUserSplit.amountOwed.toFixed(2)}`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Split Breakdown Details */}
                      <div className="bg-slate-950/40 rounded-2xl p-3 border border-slate-900/60 text-[10px] space-y-1">
                        <span className="text-slate-500 font-bold block mb-1 uppercase tracking-wider">Split Breakdown:</span>
                        {expense.splits.map(s => (
                          <div key={s.id} className="flex justify-between text-slate-400">
                            <span>{s.user.name}</span>
                            <span className="font-semibold text-slate-300">₹{s.amountOwed.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Creator Actions overlay */}
                      {wasAddedByCurrentUser && (
                        <div className="absolute right-4 bottom-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setExpenseToEdit(expense);
                              setIsExpenseOpen(true);
                            }}
                            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition"
                            title="Edit Expense"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="p-2 bg-slate-900 hover:bg-rose-950/50 border border-slate-850 hover:border-rose-900 rounded-lg text-slate-400 hover:text-rose-400 transition"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 3: Members & Live Activity Stream */}
          <div className="space-y-8">
            {/* Members Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
                <Users className="w-5 h-5 text-brand-400" />
                Group Members
              </h3>
              
              <div className="glass-panel p-5 rounded-3xl border border-slate-900 space-y-3">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center font-bold text-[9px]">
                        {getAvatarInitials(member.name)}
                      </div>
                      <span className="font-semibold text-slate-300">
                        {member.name} {member.id === currentUser.id ? '(You)' : ''}
                      </span>
                    </div>
                    <span className={`font-bold ${
                      member.netBalance > 0 
                        ? 'text-emerald-400' 
                        : member.netBalance < 0 
                          ? 'text-rose-400' 
                          : 'text-slate-500'
                    }`}>
                      {member.netBalance > 0 
                        ? `+₹${member.netBalance.toFixed(2)}` 
                        : member.netBalance < 0 
                          ? `-₹${Math.abs(member.netBalance).toFixed(2)}` 
                          : '₹0.00'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Activity Log */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-900 pb-3">
                <Activity className="w-5 h-5 text-brand-400" />
                Live Group Feed
              </h3>

              <div className="glass-panel p-5 rounded-3xl border border-slate-900 h-64 overflow-y-auto space-y-3">
                {activityFeed.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-10">No activity yet. Enter splits to start feed.</p>
                ) : (
                  activityFeed.map((activity) => (
                    <div key={activity.id} className="text-[11px] leading-relaxed border-b border-slate-900/60 pb-2">
                      <p className="text-slate-300 font-medium">{activity.message}</p>
                      <span className="text-[9px] text-slate-600">
                        {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Expense Creator/Editor Modal */}
      <AddExpenseModal
        isOpen={isExpenseOpen}
        onClose={() => {
          setIsExpenseOpen(false);
          setExpenseToEdit(null);
        }}
        members={members}
        currentUser={currentUser}
        onSave={handleSaveExpense}
        expenseToEdit={expenseToEdit}
      />

      {/* Settle Up Recorder Modal */}
      <SettleUpModal
        isOpen={isSettleOpen}
        onClose={() => {
          setIsSettleOpen(false);
          setSettlePrefill({ fromId: null, toId: null, amount: 0 });
        }}
        members={members}
        currentUser={currentUser}
        onSave={handleSaveSettlement}
        prefilledFromId={settlePrefill.fromId}
        prefilledToId={settlePrefill.toId}
        prefilledAmount={settlePrefill.amount}
      />

    </div>
  );
}

export default GroupDetails;
