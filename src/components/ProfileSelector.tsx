import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  User, 
  Plus, 
  Check, 
  Trash2, 
  X, 
  Sparkles, 
  ChevronDown, 
  ShieldCheck, 
  Lock, 
  Unlock,
  KeyRound,
  Smartphone, 
  RefreshCw,
  Layers,
  Bot,
  Pencil
} from 'lucide-react';

export interface Profile {
  id: string;
  name: string;
  avatarColor?: string;
  isMain?: boolean;
  lockPin?: string;
  phone?: string;
  telegramName?: string;
  telegramUsername?: string;
  isConnected?: boolean;
}

const PRESET_COLORS = [
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-purple-600 to-pink-600',
  'from-amber-600 to-orange-600',
  'from-rose-600 to-red-600',
  'from-cyan-600 to-blue-600'
];

interface ProfileSelectorProps {
  isConnected?: boolean;
  onSwitchAccount?: (profile: Profile) => void;
}

export default function ProfileSelector({ isConnected, onSwitchAccount }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string>('default');
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [mounted, setMounted] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileName, setEditProfileName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Lock & PIN states
  const [pinMode, setPinMode] = useState<'set' | 'verify' | 'remove' | null>(null);
  const [lockingProfileId, setLockingProfileId] = useState<string | null>(null);
  const [unlockingProfileId, setUnlockingProfileId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [lockSetupStep, setLockSetupStep] = useState<'enter_new' | 'confirm_new'>('enter_new');
  const [tempNewPin, setTempNewPin] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        if (data.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
          const loaded: Profile[] = data.accounts.map((a: any) => ({
            id: a.id,
            name: a.name,
            avatarColor: a.avatarColor || PRESET_COLORS[0],
            isMain: !!a.isMain,
            lockPin: a.lockPin || '',
            phone: a.phone || '',
            telegramName: a.telegramName || '',
            telegramUsername: a.telegramUsername || '',
            isConnected: !!a.isConnected
          }));

          setProfiles(loaded);
          localStorage.setItem('profiles', JSON.stringify(loaded));

          const savedCurrent = localStorage.getItem('currentProfileId') || localStorage.getItem('activeAccountId') || 'default';
          const validCurrent = loaded.some(p => p.id === savedCurrent) ? savedCurrent : 'default';
          setCurrentProfileId(validCurrent);
          localStorage.setItem('currentProfileId', validCurrent);
          localStorage.setItem('activeAccountId', validCurrent);
          return;
        }
      }
    } catch (e) {
      console.error('Error fetching accounts from server:', e);
    }

    // Fallback to localStorage if offline
    try {
      const savedProfiles = JSON.parse(localStorage.getItem('profiles') || '[]');
      const savedCurrent = localStorage.getItem('currentProfileId') || localStorage.getItem('activeAccountId') || 'default';
      
      if (!savedProfiles || savedProfiles.length === 0) {
        const defaultProfile: Profile = { 
          id: 'default', 
          name: 'Main Account', 
          avatarColor: PRESET_COLORS[0],
          isMain: true
        };
        localStorage.setItem('profiles', JSON.stringify([defaultProfile]));
        setProfiles([defaultProfile]);
        setCurrentProfileId('default');
      } else {
        const sanitized = savedProfiles.map((p: Profile) => {
          if (p.id === 'default' || p.name === 'Main Account') {
            return { ...p, id: 'default', isMain: true };
          }
          return p;
        });
        setProfiles(sanitized);
        setCurrentProfileId(savedCurrent);
      }
    } catch (e) {
      console.error('Error loading profiles from localStorage fallback:', e);
    }
  };

  // Load profiles from server & localStorage
  useEffect(() => {
    fetchProfiles();
  }, []);

  // Focus input when adding
  useEffect(() => {
    if (isAdding && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isAdding]);

  const handleCreateProfile = async (nameToUse?: string) => {
    const finalName = (nameToUse || newProfileName).trim();
    if (!finalName) {
      setErrorMsg('Please enter an account name');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    const newId = `acc_${Date.now()}`;
    const randomColor = PRESET_COLORS[profiles.length % PRESET_COLORS.length];
    const newProfile: Profile = {
      id: newId,
      name: finalName,
      avatarColor: randomColor,
      isMain: false
    };

    try {
      // Save directly to MongoDB server database
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          name: finalName,
          avatarColor: randomColor,
          isMain: false
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save account on server');
      }

      const updatedProfiles = [...profiles, newProfile];
      setProfiles(updatedProfiles);
      setCurrentProfileId(newProfile.id);

      localStorage.setItem('profiles', JSON.stringify(updatedProfiles));
      localStorage.setItem('currentProfileId', newProfile.id);
      localStorage.setItem('activeAccountId', newProfile.id);

      setNewProfileName('');
      setIsAdding(false);
      setIsOpen(false);

      if (onSwitchAccount) {
        onSwitchAccount(newProfile);
      }
      window.dispatchEvent(new CustomEvent('account_changed', { detail: { accountId: newProfile.id, profile: newProfile } }));
    } catch (err: any) {
      console.error('Error creating account on server:', err);
      setErrorMsg(err.message || 'Failed to create account on server');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchProfile = (id: string) => {
    if (id === currentProfileId) {
      setIsOpen(false);
      return;
    }
    const target = profiles.find(p => p.id === id);
    if (target?.lockPin) {
      setUnlockingProfileId(id);
      setPinInput('');
      setPinError('');
      setPinMode('verify');
      return;
    }
    executeProfileSwitch(id);
  };

  const executeProfileSwitch = (id: string) => {
    const target = profiles.find(p => p.id === id);
    setCurrentProfileId(id);
    localStorage.setItem('currentProfileId', id);
    localStorage.setItem('activeAccountId', id);
    setIsOpen(false);

    // Sync active account to backend server so background verification and notifications run for it immediately
    fetch('/api/accounts/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: id })
    }).catch(err => console.error('Failed to sync active account to server:', err));

    if (target && onSwitchAccount) {
      onSwitchAccount(target);
    }
    window.dispatchEvent(new CustomEvent('account_changed', { detail: { accountId: id, profile: target } }));
  };

  const handleStartPinSetup = (p: Profile, e: React.MouseEvent) => {
    e.stopPropagation();
    setLockingProfileId(p.id);
    setPinInput('');
    setPinError('');
    if (p.lockPin) {
      setPinMode('remove');
    } else {
      setPinMode('set');
      setLockSetupStep('enter_new');
    }
  };

  const handlePinAction = async (enteredPin: string) => {
    if (pinMode === 'set') {
      if (lockSetupStep === 'enter_new') {
        if (enteredPin.length < 4) {
          setPinError('PIN must be 4 digits');
          return;
        }
        setTempNewPin(enteredPin);
        setPinInput('');
        setLockSetupStep('confirm_new');
      } else if (lockSetupStep === 'confirm_new') {
        if (enteredPin !== tempNewPin) {
          setPinError('PINs do not match! Try again.');
          setPinInput('');
          setLockSetupStep('enter_new');
          return;
        }
        
        try {
          const targetProfile = profiles.find(p => p.id === lockingProfileId);
          if (!targetProfile) return;
          const res = await fetch(`/api/accounts/${lockingProfileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: targetProfile.name, lockPin: enteredPin })
          });
          if (res.ok) {
            const updated = profiles.map(p => p.id === lockingProfileId ? { ...p, lockPin: enteredPin } : p);
            setProfiles(updated);
            localStorage.setItem('profiles', JSON.stringify(updated));
            setLockingProfileId(null);
            setPinMode(null);
            setPinInput('');
            setPinError('');
          } else {
            setPinError('Failed to save PIN on server');
          }
        } catch (err) {
          console.error("Error saving PIN:", err);
          setPinError('Error saving PIN');
        }
      }
    } else if (pinMode === 'remove') {
      const targetProfile = profiles.find(p => p.id === lockingProfileId);
      if (!targetProfile) return;
      if (enteredPin !== targetProfile.lockPin) {
        setPinError('Incorrect current PIN!');
        setPinInput('');
        return;
      }
      try {
        const res = await fetch(`/api/accounts/${lockingProfileId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: targetProfile.name, lockPin: '' })
        });
        if (res.ok) {
          const updated = profiles.map(p => p.id === lockingProfileId ? { ...p, lockPin: '' } : p);
          setProfiles(updated);
          localStorage.setItem('profiles', JSON.stringify(updated));
          setLockingProfileId(null);
          setPinMode(null);
          setPinInput('');
          setPinError('');
        } else {
          setPinError('Failed to remove PIN on server');
        }
      } catch (err) {
        console.error("Error removing PIN:", err);
        setPinError('Error removing PIN');
      }
    } else if (pinMode === 'verify') {
      const targetProfile = profiles.find(p => p.id === unlockingProfileId);
      if (!targetProfile) return;
      if (enteredPin === targetProfile.lockPin) {
        const idToSwitch = unlockingProfileId;
        setUnlockingProfileId(null);
        setPinMode(null);
        setPinInput('');
        setPinError('');
        executeProfileSwitch(idToSwitch);
      } else {
        setPinError('❌ Invalid Passcode! Please try again.');
        setPinInput('');
      }
    }
  };

  const handleKeypadPress = (num: string) => {
    setPinError('');
    if (num === 'back') {
      setPinInput(prev => prev.slice(0, -1));
    } else {
      const nextVal = pinInput + num;
      if (nextVal.length <= 4) {
        setPinInput(nextVal);
        if (nextVal.length === 4) {
          setTimeout(() => handlePinAction(nextVal), 150);
        }
      }
    }
  };

  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const profileIdx = profiles.findIndex(p => p.id === id);
    if (id === 'default' || profileIdx < 2) {
      alert('This is a primary main account and cannot be deleted.');
      return;
    }
    if (profiles.length <= 1) return;

    if (!window.confirm('Are you sure you want to delete this account? All its settings, keywords, and bot sessions will be permanently deleted from the database.')) {
      return;
    }

    try {
      // Delete from MongoDB server database
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' });

      const remaining = profiles.filter(p => p.id !== id);
      setProfiles(remaining);
      localStorage.setItem('profiles', JSON.stringify(remaining));

      if (currentProfileId === id) {
        const nextId = 'default';
        const defaultProfile = remaining.find(p => p.id === 'default') || remaining[0];
        setCurrentProfileId(nextId);
        localStorage.setItem('currentProfileId', nextId);
        localStorage.setItem('activeAccountId', nextId);

        if (defaultProfile && onSwitchAccount) {
          onSwitchAccount(defaultProfile);
        }
        window.dispatchEvent(new CustomEvent('account_changed', { detail: { accountId: nextId, profile: defaultProfile } }));
      }
    } catch (err) {
      console.error('Error deleting account from server:', err);
      alert('Failed to delete account from server database');
    }
  };

  const handleStartEdit = (p: Profile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProfileId(p.id);
    setEditProfileName(p.name);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 100);
  };

  const handleSaveEdit = async (id: string, e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.stopPropagation();
    const trimmed = editProfileName.trim();
    if (!trimmed) {
      setEditingProfileId(null);
      return;
    }

    // Save rename to MongoDB server database
    try {
      await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
    } catch (err) {
      console.error('Error renaming account on server:', err);
    }

    const updatedProfiles = profiles.map(p => {
      if (p.id === id) {
        return { ...p, name: trimmed };
      }
      return p;
    });

    setProfiles(updatedProfiles);
    localStorage.setItem('profiles', JSON.stringify(updatedProfiles));
    setEditingProfileId(null);
    setEditProfileName('');
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingProfileId(null);
    setEditProfileName('');
  };

  const currentProfile = profiles.find(p => p.id === currentProfileId) || profiles[0] || {
    id: 'default',
    name: 'Main Account',
    avatarColor: PRESET_COLORS[0],
    isMain: true
  };

  return (
    <>
      {/* Header Account Switcher Button */}
      <button 
        type="button"
        id="profile-switcher-btn"
        onClick={() => {
          setIsOpen(true);
          setIsAdding(false);
          setErrorMsg('');
        }}
        className="flex items-center gap-1 sm:gap-1.5 py-1 px-1 sm:px-2 rounded-lg sm:rounded-xl transition-all duration-300 border bg-neutral-900 border-white/15 hover:border-blue-500/50 hover:bg-neutral-800 text-white shadow-md group active:scale-95 shrink-0 max-w-[95px] xs:max-w-[115px] sm:max-w-[160px]"
        title="Switch Account & Telegram Login"
      >
        <div className="relative shrink-0">
          <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg bg-gradient-to-tr ${currentProfile.avatarColor || 'from-blue-600 to-indigo-600'} flex items-center justify-center text-white shadow-md border border-white/20 group-hover:scale-105 transition-transform`}>
            <User size={11} className="text-white sm:hidden" strokeWidth={2.5} />
            <User size={13} className="text-white hidden sm:block" strokeWidth={2.5} />
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full border border-neutral-900 ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        </div>

        <div className="flex flex-col text-left min-w-0 flex-1">
          <span className="text-[10px] sm:text-[11px] font-bold truncate text-white group-hover:text-blue-300 transition-colors leading-tight">
            {currentProfile.name}
          </span>
          <span className="text-[7.5px] sm:text-[8.5px] font-medium text-slate-400 truncate leading-none mt-0.5 hidden xs:block">
            {currentProfile.telegramUsername ? `@${currentProfile.telegramUsername}` : (currentProfile.id === 'default' ? 'Main' : 'Account')}
          </span>
        </div>

        <ChevronDown size={11} className="text-slate-400 group-hover:text-white shrink-0 transition-transform" />
      </button>

      {/* FULL PORTAL MODAL (Completely detached from header CSS bounding box) */}
      {isOpen && mounted && createPortal(
        <div 
          id="account-modal-backdrop"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md transition-opacity duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
              setIsAdding(false);
              setErrorMsg('');
            }
          }}
        >
          <div 
            id="account-modal-card"
            className="relative w-full max-w-[420px] rounded-2xl bg-neutral-950 border border-white/20 shadow-2xl p-4 sm:p-5 text-white flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shadow-inner">
                  <Layers size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <h4 className="text-sm font-black tracking-wide text-white uppercase flex items-center gap-1.5">
                    Telegram Accounts
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">100% Isolated Sessions & Rules</p>
                </div>
              </div>
              <button 
                type="button"
                id="close-account-modal-btn"
                onClick={() => {
                  setIsOpen(false);
                  setIsAdding(false);
                  setErrorMsg('');
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition active:scale-95"
              >
                <X size={18} />
              </button>
            </div>

            {/* Account Isolation Notice */}
            <div className="mb-3 px-3 py-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-start gap-2.5 text-[11px] text-blue-200 shrink-0">
              <ShieldCheck size={16} className="shrink-0 text-blue-400 mt-0.5" />
              <div className="leading-tight space-y-0.5">
                <p className="font-bold text-blue-300">Complete Multi-Account Isolation:</p>
                <p className="text-blue-200/80">New account mein Telegram session, rules (keywords), target groups aur stats bilkul fresh honge aur dusre accounts ko affect nahi karenge.</p>
              </div>
            </div>

            {pinMode !== null ? (
              /* SECURE PASSCODE PAD PANEL */
              <div className="flex flex-col items-center justify-center py-2 flex-1">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 mb-3 shadow-inner">
                  <KeyRound size={22} className="animate-pulse" />
                </div>

                <h4 className="text-sm font-black text-white uppercase tracking-wider text-center">
                  {pinMode === 'verify' && 'Account Unlock'}
                  {pinMode === 'set' && 'Setup Passcode Lock'}
                  {pinMode === 'remove' && 'Disable Lock'}
                </h4>

                <p className="text-[11px] text-slate-400 font-semibold text-center mt-1">
                  {pinMode === 'verify' && `Unlock "${profiles.find(p => p.id === unlockingProfileId)?.name}"`}
                  {pinMode === 'set' && (lockSetupStep === 'enter_new' ? 'Create a 4-digit security PIN' : 'Re-enter your 4-digit PIN')}
                  {pinMode === 'remove' && `Enter PIN to disable "${profiles.find(p => p.id === lockingProfileId)?.name}" lock`}
                </p>

                {/* Secure Pin Indicators (Dots) */}
                <div className="flex justify-center gap-4 my-6">
                  {[0, 1, 2, 3].map((idx) => (
                    <div 
                      key={idx} 
                      className={`w-3.5 h-3.5 rounded-full border-2 border-slate-700 transition-all duration-300 ${
                        pinInput.length > idx 
                          ? 'bg-gradient-to-r from-emerald-400 to-teal-500 border-emerald-400 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.85)]' 
                          : 'bg-neutral-900'
                      }`}
                    />
                  ))}
                </div>

                {pinError && (
                  <p className="text-[11px] text-rose-400 font-bold mb-4 animate-bounce text-center">
                    {pinError}
                  </p>
                )}

                {/* Keypad Layout */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-[250px] mt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeypadPress(num)}
                      className="w-14 h-14 rounded-full bg-white/5 border border-white/5 text-lg font-bold hover:bg-white/10 hover:border-white/15 hover:scale-105 active:scale-95 transition-all flex items-center justify-center text-white"
                    >
                      {num}
                    </button>
                  ))}
                  
                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setPinMode(null);
                      setLockingProfileId(null);
                      setUnlockingProfileId(null);
                      setPinInput('');
                      setPinError('');
                    }}
                    className="w-14 h-14 rounded-full text-slate-400 hover:text-white text-[10px] font-black transition-all flex items-center justify-center uppercase tracking-wider"
                  >
                    Cancel
                  </button>

                  <button
                    key="0"
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="w-14 h-14 rounded-full bg-white/5 border border-white/5 text-lg font-bold hover:bg-white/10 hover:border-white/15 hover:scale-105 active:scale-95 transition-all flex items-center justify-center text-white"
                  >
                    0
                  </button>

                  {/* Backspace Button */}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('back')}
                    className="w-14 h-14 rounded-full bg-white/5 border border-white/5 text-slate-400 hover:text-white text-[10px] font-black hover:bg-rose-500/10 hover:border-rose-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center uppercase"
                    title="Backspace"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              /* STANDARD ACCOUNTS VIEW */
              <>
                {/* Scrollable Profiles List */}
                <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-[160px] max-h-[340px]">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                    <span>Account Cards ({profiles.length})</span>
                    <span>Tap to switch</span>
                  </div>
                  
                  {profiles.map((p, idx) => {
                    const isSelected = p.id === currentProfileId;
                    const isMainAccount = p.id === 'default' || p.isMain;
                    const colorClass = p.avatarColor || PRESET_COLORS[idx % PRESET_COLORS.length];
                    const isEditingThis = editingProfileId === p.id;

                    return (
                      <div
                        key={p.id}
                        id={`account-item-${p.id}`}
                        onClick={() => {
                          if (!isEditingThis) handleSwitchProfile(p.id);
                        }}
                        className={`flex flex-col p-3.5 rounded-2xl transition-all duration-300 border relative overflow-hidden group ${
                          isSelected 
                            ? 'bg-gradient-to-r from-blue-950/40 to-slate-900/40 border-blue-500/50 shadow-[0_4px_20px_rgba(59,130,246,0.15)]' 
                            : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/15'
                        } ${!isEditingThis ? 'cursor-pointer' : ''}`}
                      >
                        {/* Glow backdrop for selected card */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-blue-500/5 blur-xl rounded-2xl pointer-events-none -z-10" />
                        )}

                        <div className="flex items-center justify-between min-w-0 w-full">
                          <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-2">
                            {/* Avatar representation with cool animations */}
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${colorClass} flex items-center justify-center text-white shrink-0 shadow-lg border border-white/20 relative group-hover:scale-105 transition-transform`}>
                              <User size={18} strokeWidth={2.4} />
                              {p.lockPin && (
                                <span className="absolute -top-1 -right-1 p-0.5 bg-amber-500 text-slate-950 rounded-full border border-neutral-950 shadow-md">
                                  <Lock size={9} strokeWidth={3} />
                                </span>
                              )}
                            </div>
                            
                            {isEditingThis ? (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                <input
                                  ref={editInputRef}
                                  id={`edit-account-input-${p.id}`}
                                  type="text"
                                  value={editProfileName}
                                  onChange={(e) => setEditProfileName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(p.id, e);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                  className="w-full px-2.5 py-1 text-xs rounded-xl bg-neutral-900 border border-blue-500 text-white font-bold focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  placeholder="Account name"
                                />
                                <button
                                  type="button"
                                  id={`save-account-edit-${p.id}`}
                                  onClick={(e) => handleSaveEdit(p.id, e)}
                                  className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shrink-0 transition shadow"
                                  title="Save Name"
                                >
                                  <Check size={13} strokeWidth={2.5} />
                                </button>
                                <button
                                  type="button"
                                  id={`cancel-account-edit-${p.id}`}
                                  onClick={(e) => handleCancelEdit(e)}
                                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 shrink-0 transition"
                                  title="Cancel"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-black tracking-wide text-white leading-tight group-hover:text-blue-300 transition-colors">{p.name}</p>
                                  {isMainAccount && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/20 shadow-sm">
                                      MAIN
                                    </span>
                                  )}
                                  {p.lockPin && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/25 shadow-sm flex items-center gap-0.5">
                                      <Lock size={8} /> LOCKED
                                    </span>
                                  )}
                                </div>
                                {(p.telegramName || p.telegramUsername) && (
                                  <p className="text-[10.5px] text-blue-300 font-bold truncate mt-1 flex items-center gap-1">
                                    <Bot size={12} className="text-blue-400 shrink-0" />
                                    <span>{p.telegramName || `@${p.telegramUsername}`}</span>
                                    {p.telegramUsername && p.telegramName && (
                                      <span className="text-slate-400 text-[9.5px]">(@{p.telegramUsername})</span>
                                    )}
                                  </p>
                                )}
                                <div className="text-[10px] font-bold mt-1.5 flex items-center gap-1.5">
                                  {isSelected ? (
                                    <span className="text-emerald-400 font-black flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active Session
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-medium group-hover:text-slate-300 transition-colors flex items-center gap-1">
                                      Switch to session {p.lockPin ? '🔒' : '⚡'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {!isEditingThis && (
                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {/* Toggle Lock / Passcode Lock Button */}
                              <button
                                type="button"
                                onClick={(e) => handleStartPinSetup(p, e)}
                                className={`p-2 rounded-xl border transition-all ${
                                  p.lockPin 
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:scale-105' 
                                    : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/10 hover:scale-105'
                                }`}
                                title={p.lockPin ? 'Lock settings (Passcode Enabled)' : 'Enable Passcode Lock'}
                              >
                                {p.lockPin ? <Lock size={13} /> : <Unlock size={13} />}
                              </button>

                              {/* Rename/Edit Account Button */}
                              <button
                                type="button"
                                id={`edit-account-btn-${p.id}`}
                                onClick={(e) => handleStartEdit(p, e)}
                                className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/20 transition-all hover:scale-105"
                                title="Rename account"
                              >
                                <Pencil size={13} />
                              </button>

                              {/* First two accounts are permanent main accounts and CANNOT be deleted */}
                              {!isMainAccount && idx >= 2 && (
                                <button
                                  type="button"
                                  id={`delete-account-${p.id}`}
                                  onClick={(e) => handleDeleteProfile(p.id, e)}
                                  className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all hover:scale-105"
                                  title="Delete account"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Account Section */}
                <div className="mt-3 pt-3 border-t border-white/10 shrink-0">
                  {!isAdding ? (
                    <button
                      type="button"
                      id="start-add-account-btn"
                      onClick={() => {
                        setIsAdding(true);
                        setErrorMsg('');
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg transition active:scale-95"
                    >
                      <Plus size={16} strokeWidth={2.5} />
                      <span>+ Add New Account</span>
                    </button>
                  ) : (
                    <div className="space-y-3 bg-neutral-900/80 p-3 rounded-xl border border-white/15 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                          <Sparkles size={13} /> New Account Name
                        </span>
                        <button 
                          type="button" 
                          onClick={() => {
                            setIsAdding(false);
                            setErrorMsg('');
                          }}
                          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <input
                        ref={inputRef}
                        id="new-account-name-input"
                        type="text"
                        value={newProfileName}
                        onChange={(e) => {
                          setNewProfileName(e.target.value);
                          if (errorMsg) setErrorMsg('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateProfile();
                          if (e.key === 'Escape') setIsAdding(false);
                        }}
                        placeholder="e.g. Account 2, Work Bot, Support..."
                        className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-950 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                      />

                      {errorMsg && (
                        <p className="text-[11px] text-rose-400 font-semibold">{errorMsg}</p>
                      )}

                      {/* Quick Suggestions */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-medium">Quick Suggestions:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {['Telegram 2', 'Support Bot', 'Work Account', 'Personal 2'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleCreateProfile(preset)}
                              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-200 border border-white/10 transition"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          id="confirm-create-account-btn"
                          onClick={() => handleCreateProfile()}
                          className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition active:scale-95"
                        >
                          Create & Switch
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAdding(false);
                            setErrorMsg('');
                          }}
                          className="py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-bold text-xs transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Background Live Sync & Test Notification Footer */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>24/7 Cloud Background Sync Active</span>
                    </div>
                    <button
                      type="button"
                      id="test-push-btn"
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/push/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              title: `🔔 [${profiles.find(p => p.id === currentProfileId)?.name || 'BotFlow'}] Background Test`,
                              body: `Background notifications are working perfectly on this device for ${profiles.find(p => p.id === currentProfileId)?.name || 'Account'}!`
                            })
                          });
                          if (res.ok) {
                            alert('Test notification dispatched! Check your device notification bar.');
                          } else {
                            alert('Could not dispatch test. Ensure notification permissions are enabled in your browser/device settings.');
                          }
                        } catch (e) {
                          alert('Error sending test notification.');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold transition active:scale-95 text-[10px]"
                    >
                      Test Push 🔔
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
