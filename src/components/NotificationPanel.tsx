import React, { useState, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  X, 
  User, 
  ExternalLink, 
  Smartphone, 
  Laptop, 
  Globe, 
  Send, 
  RefreshCw, 
  Trash2, 
  ShieldCheck, 
  Radio, 
  Copy, 
  Check, 
  Sparkles, 
  Zap, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Camera, 
  ShieldAlert,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getDeviceInfo, pingDeviceSession, enablePushNotifications } from '../utils/deviceTracker';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  logs: any[];
  darkMode: boolean;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose, logs, darkMode }) => {
  const [activeTab, setActiveTab] = useState<'alerts' | 'devices' | 'senders'>('alerts');
  const [alertFilter, setAlertFilter] = useState<'all' | 'replies' | 'photos' | 'push' | 'blocked' | 'system'>('all');
  
  // Devices state
  const [devices, setDevices] = useState<any[]>([]);
  const [currentIp, setCurrentIp] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [targetedPushingId, setTargetedPushingId] = useState<string | null>(null);
  const [aiAutoMode, setAiAutoMode] = useState(false);
  const [pushScope, setPushScope] = useState<'current' | 'all'>(
    (localStorage.getItem('botflow_push_scope') as 'current' | 'all') || 'current'
  );

  // Push form state
  const [customTitle, setCustomTitle] = useState('⚡ Blind Push Broadcast');
  const [customBody, setCustomBody] = useState('Notification delivered to all active IPs & logged-in devices!');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const localDeviceInfo = useMemo(() => getDeviceInfo(), []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copied: ${text.slice(0, 24)}...`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fetchDevices = async () => {
    try {
      setLoadingDevices(true);
      const activeAccId = localStorage.getItem('currentProfileId') || 'default';
      // First ensure our local session is pinged
      await pingDeviceSession(activeAccId);

      const res = await fetch(`/api/devices?deviceId=${encodeURIComponent(localDeviceInfo.deviceId)}`, {
        headers: {
          'x-device-id': localDeviceInfo.deviceId,
          'x-device-name': localDeviceInfo.deviceName,
          'x-account-id': activeAccId
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
        setCurrentIp(data.currentIp || '');
      }
    } catch (e) {
      console.error('Error fetching devices:', e);
    } finally {
      setLoadingDevices(false);
    }
  };

  const fetchAiAutoMode = async () => {
    try {
      const activeAccId = localStorage.getItem('currentProfileId') || 'default';
      const res = await fetch('/api/push/ai-auto-mode', {
        headers: { 'x-account-id': activeAccId }
      });
      if (res.ok) {
        const data = await res.json();
        setAiAutoMode(Boolean(data.enabled));
      }
    } catch (e) {}
  };

  const toggleAiAutoMode = async () => {
    try {
      const newVal = !aiAutoMode;
      const activeAccId = localStorage.getItem('currentProfileId') || 'default';
      const res = await fetch('/api/push/ai-auto-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-account-id': activeAccId
        },
        body: JSON.stringify({ enabled: newVal })
      });
      if (res.ok) {
        setAiAutoMode(newVal);
        toast.success(newVal ? '🤖 AI Auto Mode for Push enabled!' : 'AI Auto Mode disabled.');
      }
    } catch (e) {
      toast.error('Failed to update AI Auto Mode');
    }
  };

  const handlePushScopeChange = async (scope: 'current' | 'all') => {
    setPushScope(scope);
    localStorage.setItem('botflow_push_scope', scope);
    toast.loading(`Updating notification scope to ${scope}...`, { id: 'scope-update' });
    
    // Re-subscribe to apply scope
    const activeAccId = localStorage.getItem('currentProfileId') || 'default';
    const result = await enablePushNotifications(activeAccId);
    if (result.success) {
      toast.success(`Notifications will now be received for ${scope === 'all' ? 'All Profiles' : 'Current Profile'}.`, { id: 'scope-update' });
      fetchDevices();
    } else {
      toast.error(`Scope saved locally, but server update failed.`, { id: 'scope-update' });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDevices();
      fetchAiAutoMode();
      const interval = setInterval(fetchDevices, 12000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Filter logs for Alerts
  const filteredAlertLogs = useMemo(() => {
    return logs.filter((log: any) => {
      const msg = (log.message || '').toLowerCase();
      const cat = (log.category || '').toLowerCase();

      switch (alertFilter) {
        case 'replies':
          return msg.includes('auto-reply') || msg.includes('matched') || msg.includes('replied') || msg.includes('reply');
        case 'photos':
          return msg.includes('photo') || cat.includes('photo');
        case 'push':
          return msg.includes('push') || cat.includes('push');
        case 'blocked':
          return msg.includes('block') || log.level === 'error' || log.level === 'warn';
        case 'system':
          return cat.includes('system') || cat.includes('api') || msg.includes('login') || msg.includes('verified');
        case 'all':
        default:
          return true;
      }
    });
  }, [logs, alertFilter]);

  // Extract unique senders for Senders tab
  const recentSenders = useMemo(() => {
    const photoLogs = logs.filter((l: any) => (l.message || '').toLowerCase().includes('photo'));
    const map = new Map();
    photoLogs.forEach((l: any) => {
      try {
        let details = l.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (e) { details = {}; }
        }
        details = details || {};
        const topicId = details.topicId || l.message.match(/topic (\d+)/)?.[1] || '';
        const topicName = l.message.replace('Photo received from ', '').replace('Photo auto-reply sent to ', '').split(':')[0] || 'Member';
        const key = topicId || topicName;
        if (!map.has(key)) {
          map.set(key, { name: topicName, id: topicId, details, timestamp: l.timestamp });
        }
      } catch (e) {}
    });
    return Array.from(map.values());
  }, [logs]);

  // Blind Push broadcast to ALL active devices / sessions
  const handleBlindPush = async () => {
    try {
      setIsBroadcasting(true);
      const activeAccId = localStorage.getItem('currentProfileId') || 'default';
      const res = await fetch('/api/push/blind-broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-account-id': activeAccId,
          'x-device-id': localDeviceInfo.deviceId,
          'x-device-name': localDeviceInfo.deviceName
        },
        body: JSON.stringify({
          title: customTitle || '⚡ Blind Push Broadcast',
          body: customBody || `Delivered to all active sessions! (Sender IP: ${currentIp || 'Connected'})`
        })
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`🚀 Push broadcast sent to ${data.deliveredCount || devices.length} device(s)!`);
        fetchDevices();
      } else {
        toast.error('Failed to broadcast push notification');
      }
    } catch (e) {
      toast.error('Network error broadcasting push');
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Targeted Push to a SINGLE device
  const handleTargetedPush = async (device: any) => {
    try {
      setTargetedPushingId(device.deviceId || device.id);
      const activeAccId = localStorage.getItem('currentProfileId') || 'default';
      const res = await fetch('/api/push/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-account-id': activeAccId,
          'x-device-id': localDeviceInfo.deviceId
        },
        body: JSON.stringify({
          title: `🎯 Direct Push to ${device.deviceName}`,
          body: `Direct notification delivered to IP: ${device.ip} (${device.accountName || 'Profile'})`,
          targetDeviceId: device.deviceId,
          targetIp: device.ip
        })
      });

      if (res.ok) {
        toast.success(`🎯 Direct push sent to ${device.deviceName}!`);
        fetchDevices();
      } else {
        toast.error('Failed to send direct push');
      }
    } catch (e) {
      toast.error('Error sending direct push');
    } finally {
      setTargetedPushingId(null);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Device disconnected');
        fetchDevices();
      }
    } catch (e) {
      toast.error('Could not remove device');
    }
  };

  const onlineDevicesCount = devices.filter(d => d.isOnline).length;
  const pushReadyDevicesCount = devices.filter(d => d.hasPush).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className={`fixed top-0 right-0 bottom-0 w-full sm:w-[440px] z-[101] shadow-2xl flex flex-col ${
              darkMode ? 'bg-slate-950 text-slate-100 border-l border-white/10' : 'bg-white text-slate-900 border-l border-slate-200'
            }`}
          >
            {/* Header */}
            <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${darkMode ? 'border-white/10 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'}`}>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
                  <Bell size={18} className="animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-black text-sm uppercase tracking-wider">
                      Notification Hub
                    </h2>
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      LIVE
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      IP: {currentIp || 'Tracking...'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">•</span>
                    <span className="text-[10px] text-indigo-400 font-bold">
                      {devices.length} Connected
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className={`p-2 rounded-full transition-all duration-200 hover:scale-105 ${
                  darkMode ? 'hover:bg-white/10 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className={`flex p-1.5 gap-1.5 border-b ${darkMode ? 'border-white/10 bg-slate-900/40' : 'border-slate-100 bg-slate-100/60'}`}>
              <button 
                onClick={() => setActiveTab('alerts')}
                className={`flex-1 py-2 text-[10.5px] font-black uppercase tracking-wider transition-all duration-200 rounded-xl relative flex items-center justify-center gap-1.5 ${
                  activeTab === 'alerts' 
                    ? 'text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-600/30' 
                    : (darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Bell size={13} />
                Alerts ({logs.length})
              </button>
              <button 
                onClick={() => setActiveTab('devices')}
                className={`flex-1 py-2 text-[10.5px] font-black uppercase tracking-wider transition-all duration-200 rounded-xl relative flex items-center justify-center gap-1.5 ${
                  activeTab === 'devices' 
                    ? 'text-white bg-gradient-to-r from-indigo-600 to-purple-600 shadow-md shadow-indigo-600/30' 
                    : (darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <Smartphone size={13} />
                Devices ({devices.length})
              </button>
              <button 
                onClick={() => setActiveTab('senders')}
                className={`flex-1 py-2 text-[10.5px] font-black uppercase tracking-wider transition-all duration-200 rounded-xl relative flex items-center justify-center gap-1.5 ${
                  activeTab === 'senders' 
                    ? 'text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md shadow-emerald-600/30' 
                    : (darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <User size={13} />
                Senders ({recentSenders.length})
              </button>
            </div>

            {/* Tab 1: Activity & Alerts */}
            {activeTab === 'alerts' && (
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { id: 'all', label: `All (${logs.length})` },
                    { id: 'replies', label: 'Replies' },
                    { id: 'photos', label: 'Photos' },
                    { id: 'push', label: 'Push' },
                    { id: 'blocked', label: 'Blocks/Errors' },
                    { id: 'system', label: 'System' },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setAlertFilter(chip.id as any)}
                      className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                        alertFilter === chip.id
                          ? (darkMode ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30' : 'bg-blue-600 text-white')
                          : (darkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {filteredAlertLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 opacity-60">
                    <div className={`p-4 rounded-3xl ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                      <Bell size={32} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest">No notifications found</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
                        Activity logs, auto-replies, photo alerts, and push messages will appear here in real-time.
                      </p>
                    </div>
                  </div>
                ) : (
                  filteredAlertLogs.slice(0, 60).map((log: any) => {
                    const isPhoto = (log.message || '').toLowerCase().includes('photo');
                    const isBlock = (log.message || '').toLowerCase().includes('block');
                    const isPush = (log.message || '').toLowerCase().includes('push') || log.category === 'Push';
                    const isError = log.level === 'error';
                    const isWarn = log.level === 'warn';

                    let badgeColor = darkMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-blue-100 text-blue-700 border-blue-200';
                    let badgeText = log.category || 'LOG';

                    if (isPhoto) {
                      badgeColor = darkMode ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-purple-100 text-purple-700 border-purple-200';
                      badgeText = 'PHOTO';
                    } else if (isPush) {
                      badgeColor = darkMode ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-indigo-100 text-indigo-700 border-indigo-200';
                      badgeText = 'PUSH DISPATCH';
                    } else if (isBlock) {
                      badgeColor = darkMode ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-rose-100 text-rose-700 border-rose-200';
                      badgeText = 'BLOCKED';
                    } else if (isError) {
                      badgeColor = darkMode ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-red-100 text-red-700 border-red-200';
                      badgeText = 'ERROR';
                    } else if (isWarn) {
                      badgeColor = darkMode ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-700 border-amber-200';
                      badgeText = 'WARNING';
                    }

                    return (
                      <div
                        key={log._id || `${log.timestamp}_${Math.random()}`}
                        className={`p-3.5 rounded-2xl border transition-all duration-200 ${
                          darkMode ? 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.06]' : 'bg-slate-50 border-slate-200/70 hover:border-slate-300 hover:bg-slate-100/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider border ${badgeColor}`}>
                            {badgeText}
                          </span>
                          <span className="text-[9px] font-mono opacity-50">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>

                        <p className={`text-[12px] font-medium leading-snug break-words ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {log.message}
                        </p>

                        {log.details && (
                          <div className={`mt-2 p-2 rounded-xl text-[10px] font-mono break-all ${
                            darkMode ? 'bg-black/40 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200'
                          }`}>
                            {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Devices & Push Center (Blind Push to all open devices) */}
            {activeTab === 'devices' && (
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4">
                {/* Live Device Sync Status Banner */}
                <div className={`p-4 rounded-3xl border bg-gradient-to-br ${
                  darkMode ? 'from-indigo-950/40 via-blue-950/30 to-purple-950/40 border-indigo-500/20' : 'from-indigo-50 via-blue-50 to-purple-50 border-indigo-200'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Radio size={15} className="text-emerald-400 animate-pulse" />
                        <span className="text-xs font-black uppercase tracking-wider">Device Tracing Engine</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {onlineDevicesCount} online • {pushReadyDevicesCount} push ready • {devices.length} registered sessions
                      </p>
                    </div>
                    <button
                      onClick={fetchDevices}
                      disabled={loadingDevices}
                      className={`p-2 rounded-xl transition ${darkMode ? 'bg-white/10 hover:bg-white/15' : 'bg-white shadow-sm hover:bg-slate-100'}`}
                      title="Refresh Connected Devices"
                    >
                      <RefreshCw size={13} className={loadingDevices ? 'animate-spin text-blue-400' : 'text-slate-400'} />
                    </button>
                  </div>

                  {/* Current Client Fingerprint */}
                  <div className={`mt-3 p-2.5 rounded-2xl flex items-center justify-between text-[10px] ${
                    darkMode ? 'bg-black/40 border border-white/5' : 'bg-white/90 border border-indigo-100'
                  }`}>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 tracking-wider">This Device Fingerprint:</span>
                      <span className="font-mono font-bold text-emerald-400 truncate max-w-[220px]">
                        {localDeviceInfo.deviceId}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(localDeviceInfo.deviceId, 'my_dev_id')}
                      className={`p-1.5 rounded-lg transition ${darkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                      title="Copy Device ID"
                    >
                      {copiedKey === 'my_dev_id' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-slate-400" />}
                    </button>
                  </div>

                  <button
                    onClick={async () => {
                      const activeAccId = localStorage.getItem('currentProfileId') || 'default';
                      const result = await enablePushNotifications(activeAccId);
                      if (result.success) {
                        toast.success(result.message);
                        fetchDevices();
                      } else {
                        toast.error(result.message);
                      }
                    }}
                    className="w-full mt-3 py-2 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10.5px] uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30 transition"
                  >
                    <Bell size={13} />
                    Enable Browser Push Notifications 🔔
                  </button>

                  <div className={`mt-3 p-3 rounded-2xl flex flex-col gap-2 border ${darkMode ? 'bg-slate-800/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Receive Push Notifications For:</label>
                    <div className="flex bg-slate-900/10 p-1 rounded-xl">
                      <button 
                        onClick={() => handlePushScopeChange('current')}
                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                          pushScope === 'current' 
                            ? 'bg-white shadow-sm text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' 
                            : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        Current Profile Only
                      </button>
                      <button 
                        onClick={() => handlePushScopeChange('all')}
                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                          pushScope === 'all' 
                            ? 'bg-white shadow-sm text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' 
                            : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        All Profiles
                      </button>
                    </div>
                  </div>
                </div>

                {/* AI Auto Mode for Push Card */}
                <div className={`p-4 rounded-3xl border flex items-center justify-between ${
                  darkMode ? 'bg-purple-950/20 border-purple-500/30' : 'bg-purple-50 border-purple-200'
                }`}>
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 rounded-2xl bg-purple-600 text-white shadow-md shadow-purple-600/30">
                      <Sparkles size={18} className="animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider">AI Auto Mode for Push</span>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          GEMINI AI
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Automatically summarizes & enhances push notifications using Gemini.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={toggleAiAutoMode}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md whitespace-nowrap ${
                      aiAutoMode 
                        ? 'bg-purple-600 text-white shadow-purple-600/40 hover:bg-purple-500' 
                        : (darkMode ? 'bg-white/10 text-slate-300 hover:bg-white/15' : 'bg-slate-200 text-slate-700 hover:bg-slate-300')
                    }`}
                  >
                    {aiAutoMode ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Blind Push Broadcast Form */}
                <div className={`p-4 rounded-3xl border ${
                  darkMode ? 'bg-white/[0.02] border-white/10' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-400" />
                      <span className="text-[11px] font-black uppercase tracking-wider">Blind Push to All Devices</span>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      INSTANT
                    </span>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Push Notification Title..."
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition ${
                        darkMode ? 'bg-slate-900 border-white/10 text-white focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-600'
                      }`}
                    />
                    <textarea
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      placeholder="Push Notification Message..."
                      rows={2}
                      className={`w-full px-3 py-2 rounded-xl text-xs border transition ${
                        darkMode ? 'bg-slate-900 border-white/10 text-white focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-600'
                      }`}
                    />

                    {/* Preset Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {[
                        { title: '⚡ Urgent Store Alert', body: 'Please check your pending Telegram orders and replies immediately!' },
                        { title: '🚀 Blind Sync to All Devices', body: `Broadcasting live sync signal from IP ${currentIp || 'Host'}` },
                        { title: '✅ Bot Online & Running', body: 'Telegram UserBot is actively responding to customer keyword queries.' },
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCustomTitle(preset.title);
                            setCustomBody(preset.body);
                          }}
                          className={`px-2 py-1 rounded-lg text-[9px] font-bold whitespace-nowrap transition ${
                            darkMode ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                        >
                          {preset.title.split(' ')[1] || preset.title}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleBlindPush}
                      disabled={isBroadcasting}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:brightness-110 active:scale-95 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      <Send size={13} />
                      {isBroadcasting ? 'Broadcasting...' : `Blind Push to All ${devices.length} Devices 🚀`}
                    </button>
                  </div>
                </div>

                {/* Connected / Tracked Devices List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Logged-in / Open Sessions ({devices.length})
                    </span>
                    <span className="text-[9px] text-emerald-400 font-bold">
                      {onlineDevicesCount} Active Now
                    </span>
                  </div>

                  {loadingDevices && devices.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-slate-400">
                      <RefreshCw size={20} className="animate-spin mr-2 text-indigo-400" />
                      <span className="text-xs font-bold">Scanning active devices & IPs...</span>
                    </div>
                  ) : devices.length === 0 ? (
                    <div className="text-center py-10 opacity-60 space-y-2">
                      <Smartphone size={32} className="mx-auto text-slate-400" />
                      <p className="text-xs font-bold uppercase tracking-widest">No Devices Registered</p>
                      <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                        Allow notifications on any phone or laptop to register it here for blind push delivery.
                      </p>
                    </div>
                  ) : (
                    devices.map((device) => {
                      const isCurrentDev = device.isCurrent || device.deviceId === localDeviceInfo.deviceId;
                      const devId = device.deviceId || device.id;
                      const isDirectPushing = targetedPushingId === devId;

                      return (
                        <div
                          key={devId}
                          className={`p-3.5 rounded-3xl border transition-all duration-200 ${
                            isCurrentDev 
                              ? (darkMode ? 'bg-indigo-950/20 border-indigo-500/40 ring-1 ring-indigo-500/20' : 'bg-indigo-50/70 border-indigo-200')
                              : (darkMode ? 'bg-white/[0.03] border-white/5 hover:border-white/10' : 'bg-slate-50 border-slate-200')
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-3 overflow-hidden">
                              <div className={`p-2.5 rounded-2xl shrink-0 ${
                                device.platform === 'Desktop' || device.platform === 'Windows' || device.platform === 'macOS'
                                  ? 'bg-emerald-500/10 text-emerald-400' 
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}>
                                {device.platform === 'Desktop' || device.platform === 'Windows' || device.platform === 'macOS' 
                                  ? <Laptop size={17} /> 
                                  : <Smartphone size={17} />}
                              </div>
                              <div className="overflow-hidden">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold truncate">
                                    {device.deviceName}
                                  </span>
                                  {isCurrentDev && (
                                    <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                      THIS DEVICE
                                    </span>
                                  )}
                                  {device.isOnline ? (
                                    <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                      ONLINE
                                    </span>
                                  ) : (
                                    <span className="text-[8.5px] text-slate-400">
                                      Seen {new Date(device.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {/* IP Address */}
                                  <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                                    <Globe size={10} />
                                    <span>{device.ip}</span>
                                    <button 
                                      onClick={() => handleCopy(device.ip, `ip_${devId}`)}
                                      className="hover:opacity-100 opacity-60 ml-0.5"
                                    >
                                      {copiedKey === `ip_${devId}` ? <Check size={10} /> : <Copy size={10} />}
                                    </button>
                                  </div>

                                  <span className="text-slate-400">•</span>

                                  {/* Device ID */}
                                  <div className="flex items-center gap-1 text-[9.5px] font-mono text-slate-400">
                                    <span>ID: {devId.substring(0, 14)}...</span>
                                    <button 
                                      onClick={() => handleCopy(devId, `id_${devId}`)}
                                      className="hover:opacity-100 opacity-60 ml-0.5"
                                    >
                                      {copiedKey === `id_${devId}` ? <Check size={10} /> : <Copy size={10} />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleRemoveDevice(devId)}
                              title="Disconnect Device"
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {/* Footer Info & Direct Push Button */}
                          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Logged in:</span>
                              <span className="font-bold text-indigo-400">{device.accountName || 'Main Profile'}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {device.hasPush ? (
                                <span className="text-emerald-400 font-bold flex items-center gap-1 text-[9px]">
                                  <ShieldCheck size={11} /> Push Ready
                                </span>
                              ) : (
                                <span className="text-amber-400 font-medium text-[9px]">
                                  Push Off
                                </span>
                              )}

                              <button
                                onClick={() => handleTargetedPush(device)}
                                disabled={isDirectPushing}
                                className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition ${
                                  darkMode ? 'bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                }`}
                              >
                                <Send size={9} />
                                {isDirectPushing ? 'Pushing...' : 'Direct Push'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Photo Senders & Topic Links */}
            {activeTab === 'senders' && (
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
                {recentSenders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 opacity-60">
                    <div className={`p-4 rounded-3xl ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                      <Camera size={32} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest">No recent photo senders</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
                        Users sending payment QR codes or images will appear here with instant links to their Telegram topic.
                      </p>
                    </div>
                  </div>
                ) : (
                  recentSenders.map((sender) => (
                    <div 
                      key={sender.id || sender.name} 
                      onClick={() => {
                        try {
                          const details = sender.details || {};
                          const topicId = sender.id;
                          const cleanGroupId = '3672030592'.replace("-100", ""); 
                          const url = details.url || (topicId ? `https://t.me/c/${cleanGroupId}/${topicId}` : null);
                          if (url) {
                            window.open(url, '_blank');
                          } else {
                            toast.error("Topic link not found");
                          }
                        } catch (e) {
                          toast.error("Error opening topic");
                        }
                      }}
                      className={`p-3.5 rounded-3xl border transition-all duration-300 flex items-center justify-between cursor-pointer group hover:scale-[1.01] ${
                        darkMode ? 'bg-white/[0.03] border-white/5 hover:bg-white/[0.08] hover:border-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-2xl overflow-hidden bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform shrink-0">
                          <img 
                            src={`https://picsum.photos/seed/${sender.id || sender.name}/100`} 
                            alt={sender.name} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-xs font-black truncate">{sender.name}</span>
                          <span className="text-[9px] font-mono opacity-50">Topic ID: {sender.id || 'Unknown'}</span>
                        </div>
                      </div>
                      <div className={`p-2 rounded-xl transition ${
                        darkMode ? 'text-blue-400 group-hover:bg-blue-500/20' : 'text-blue-600 group-hover:bg-blue-50'
                      }`}>
                        <ExternalLink size={16} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Footer */}
            <div className={`p-3.5 sm:p-4 border-t flex items-center justify-between gap-2 ${darkMode ? 'border-white/10 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'}`}>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>Active Tracing: ON</span>
              </div>
              <button 
                onClick={onClose}
                className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider transition ${
                  darkMode ? 'bg-white/10 text-slate-200 hover:bg-white/20' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Close Panel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default memo(NotificationPanel);
