import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { API_URL } from '../config';
import { 
  Wallet, Plus, LogOut, ArrowRight, UserPlus, Users, 
  TrendingUp, TrendingDown, RefreshCw, Bell, Check, Trash
} from 'lucide-react';

function Dashboard() {
  const { user, logout } = useAuth();
  const { notifications, clearNotifications, markAllAsRead } = useSocket();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Group creation state
  const [newGroupName, setNewGroupName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Group joining state
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  // UI state
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchGroups = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/groups`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups);
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to fetch groups');
      }
    } catch (err) {
      console.error('Fetch groups error:', err);
      setError('Connection error. Failed to load groups.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      setCreating(true);
      setCreateError('');
      const res = await fetch(`${API_URL}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName }),
        credentials: 'include',
      });

      const data = await res.json();
      if (res.ok) {
        setNewGroupName('');
        fetchGroups(true); // Silent reload
      } else {
        setCreateError(data.message || 'Failed to create group');
      }
    } catch (err) {
      setCreateError('Network error. Failed to create group.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    try {
      setJoining(true);
      setJoinError('');
      const res = await fetch(`${API_URL}/api/groups/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.toUpperCase() }),
        credentials: 'include',
      });

      const data = await res.json();
      if (res.ok) {
        setInviteCode('');
        fetchGroups(true); // Silent reload
        navigate(`/groups/${data.group.id}`);
      } else {
        setJoinError(data.message || 'Failed to join group');
      }
    } catch (err) {
      setJoinError('Network error. Failed to join group.');
    } finally {
      setJoining(false);
    }
  };

  // Helper: Get random color based on string for user avatar
  const getAvatarColor = (str) => {
    const colors = [
      'bg-purple-600', 'bg-blue-600', 'bg-teal-600', 
      'bg-indigo-600', 'bg-rose-600', 'bg-emerald-600',
      'bg-violet-600', 'bg-cyan-600', 'bg-fuchsia-600'
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-600/5 rounded-full blur-3xl"></div>
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl"></div>

      {/* Navigation Top Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
              <Wallet className="w-6 h-6 text-brand-400" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-brand-300 bg-clip-text text-transparent">
              SplitStream
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Center */}
            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  markAllAsRead();
                }}
                className="p-2 rounded-xl hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 transition relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-[10px] font-bold text-white rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-3 w-80 max-h-96 overflow-y-auto glass-panel border border-slate-800 rounded-2xl shadow-xl z-50 p-4">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-900">
                    <span className="font-bold text-sm text-slate-200">Activity Alerts</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={clearNotifications}
                        className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
                      >
                        <Trash className="w-3 h-3" /> Clear
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">No recent alerts.</p>
                    ) : (
                      notifications.map((notif) => (
                        <div 
                          key={notif.id}
                          className={`p-3 rounded-xl border text-xs transition ${
                            notif.read ? 'bg-slate-950/20 border-slate-900 text-slate-400' : 'bg-brand-500/5 border-brand-500/20 text-slate-200 font-medium'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span>{notif.message}</span>
                            {notif.groupId && (
                              <button 
                                onClick={() => {
                                  setShowNotifications(false);
                                  navigate(`/groups/${notif.groupId}`);
                                }}
                                className="text-[10px] text-brand-400 hover:underline shrink-0"
                              >
                                View
                              </button>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-500 mt-1 block">
                            {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Logout button */}
            <button 
              onClick={logout}
              className="px-4 py-2 text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-rose-950 text-slate-400 hover:text-rose-400 rounded-xl flex items-center gap-2 transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 mt-8">
        
        {/* Welcome and Stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">
              Welcome back, {user?.name.split(' ')[0]} 👋
            </h2>
            <p className="text-slate-400 mt-1">Keep track of your shared bills and settle up in real-time.</p>
          </div>
          <button 
            onClick={() => fetchGroups(true)}
            disabled={refreshing}
            className="self-start px-4 py-2 text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Groups & Actions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Groups Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-400" />
                My Groups
              </h3>
              <span className="px-2.5 py-1 text-xs font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-full">
                {groups.length} {groups.length === 1 ? 'group' : 'groups'}
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-900 rounded-3xl">
                <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm text-slate-500">Loading your groups...</p>
              </div>
            ) : error ? (
              <div className="p-6 text-center bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-3xl">
                {error}
              </div>
            ) : groups.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/10 border border-dashed border-slate-800 rounded-3xl">
                <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 font-semibold text-lg">No groups yet</p>
                <p className="text-slate-500 text-sm mt-1 mb-6">Create a group or use an invite code to join one!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map((group) => (
                  <div 
                    key={group.id}
                    onClick={() => navigate(`/groups/${group.id}`)}
                    className="glass-panel glass-panel-hover p-6 rounded-3xl cursor-pointer flex flex-col justify-between min-h-[160px] group transition"
                  >
                    <div>
                      <h4 className="font-extrabold text-xl text-white group-hover:text-brand-300 transition-colors">
                        {group.name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Created {new Date(group.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-900/40">
                      {/* Avatars */}
                      <div className="flex -space-x-2 overflow-hidden">
                        {group.members.slice(0, 4).map((member) => (
                          <div 
                            key={member.id} 
                            title={member.name}
                            className={`w-7 h-7 rounded-full ${getAvatarColor(member.name)} flex items-center justify-center text-[10px] font-bold text-white border border-slate-950`}
                          >
                            {getInitials(member.name)}
                          </div>
                        ))}
                        {group.members.length > 4 && (
                          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 border border-slate-950">
                            +{group.members.length - 4}
                          </div>
                        )}
                      </div>

                      <span className="text-xs font-semibold text-brand-400 group-hover:text-brand-300 flex items-center gap-1">
                        Details <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions / Create & Join Sidebar */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-900 pb-3 flex items-center gap-2">
              <Plus className="w-5 h-5 text-brand-400" />
              Quick Actions
            </h3>

            {/* Create Group Form */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-900 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400">
                  <Plus className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-white text-sm">Create New Group</h4>
              </div>

              {createError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl">{createError}</p>
              )}

              <form onSubmit={handleCreateGroup} className="space-y-3">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Goa Trip 🏖️, Flatmates 🏠"
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
                  required
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 text-xs font-semibold text-white rounded-2xl flex items-center justify-center gap-2 transition"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </form>
            </div>

            {/* Join Group Form */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-900 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-white text-sm">Join via Invite Code</h4>
              </div>

              {joinError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl">{joinError}</p>
              )}

              <form onSubmit={handleJoinGroup} className="space-y-3">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="e.g. GOATRIP8"
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition uppercase"
                  required
                />
                <button
                  type="submit"
                  disabled={joining}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-xs font-semibold text-white rounded-2xl flex items-center justify-center gap-2 transition"
                >
                  {joining ? 'Joining...' : 'Join Group'}
                </button>
              </form>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}

export default Dashboard;
