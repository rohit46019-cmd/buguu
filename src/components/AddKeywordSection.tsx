import React, { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { Plus, X, Hash, Link, Trash2, Sparkles, Zap, MessageSquare, Users, Check, Bell, ShieldCheck, ChevronDown, ChevronUp, Copy } from 'lucide-react';

export const KeywordInput = memo(({ value, onChange, onRemove, showRemove, darkMode, index }: any) => {
  const colors = ['emerald', 'blue', 'rose', 'amber', 'purple', 'indigo'];
  const color = colors[(index || 0) % 6];

  return (
    <div className="flex items-center gap-1.5 group">
      <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono font-bold ${darkMode ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
        {(index || 0) + 1}
      </div>
      <div className="relative flex-1">
        <Hash size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-${color}-500 pointer-events-none`} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter keyword or phrase..."
          className={`w-full pl-7 pr-3 py-1.5 border rounded-lg focus:ring-1 focus:ring-${color}-500 outline-none text-xs transition ${
            darkMode 
              ? `bg-${color}-500/10 border-${color}-500/30 text-white placeholder-white/20` 
              : `bg-${color}-50/50 border-${color}-200 text-slate-900 placeholder-slate-400`
          }`}
        />
      </div>
      {showRemove && (
        <button 
          onClick={onRemove} 
          className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md transition"
          title="Remove keyword"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
});

export const ReplyInput = memo(({ value, onChange, darkMode }: any) => {
  return (
    <div className="relative">
      <MessageSquare size={13} className="absolute left-2.5 top-2.5 text-blue-500 pointer-events-none" />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Auto-reply text message..."
        rows={3}
        className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-xs transition resize-none leading-relaxed ${
          darkMode 
            ? 'bg-white/5 border-white/10 text-white placeholder-white/20' 
            : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
        }`}
      />
    </div>
  );
});

interface AddKeywordSectionProps {
  editingKeyword: any;
  onSave: (data: any) => void;
  onCancel: () => void;
  darkMode: boolean;
}

const AddKeywordSection: React.FC<AddKeywordSectionProps> = ({ 
  editingKeyword, 
  onSave, 
  onCancel, 
  darkMode 
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newKeywords, setNewKeywords] = useState<string[]>([""]);
  const [newReply, setNewReply] = useState("");
  const [newMatchMode, setNewMatchMode] = useState<'exact' | 'partial'>('exact');
  const [newMessageLinks, setNewMessageLinks] = useState<string[]>([""]);
  const [newMaxReplies, setNewMaxReplies] = useState<number | string>(0);
  const [newAiReplyEnabled, setNewAiReplyEnabled] = useState(false);
  const [newApprovalMode, setNewApprovalMode] = useState(false);
  const [newNotifyOnHit, setNewNotifyOnHit] = useState(false);
  const [newTargetGroups, setNewTargetGroups] = useState<string[]>([]);
  const [customGroupInput, setCustomGroupInput] = useState("");
  const [availableGroups, setAvailableGroups] = useState<{ id: string; title: string }[]>([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [groupSearchTerm, setGroupSearchTerm] = useState("");

  useEffect(() => {
    fetch("/api/groups")
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.groups)) {
          setAvailableGroups(data.groups);
        }
      })
      .catch(err => console.error("Error fetching groups:", err));
  }, []);

  const toggleSelectGroup = (groupIdOrTitle: string) => {
    if (newTargetGroups.includes(groupIdOrTitle)) {
      setNewTargetGroups(newTargetGroups.filter(g => g !== groupIdOrTitle));
    } else {
      setNewTargetGroups([...newTargetGroups, groupIdOrTitle]);
    }
  };

  const getGroupName = (idOrTitle: string) => {
    const found = availableGroups.find(g => g.id === idOrTitle || g.title === idOrTitle);
    if (found && found.title && found.title !== found.id) {
      return found.title;
    }
    return idOrTitle;
  };

  const prevEditingIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const currentId = editingKeyword ? editingKeyword._id : null;
    if (prevEditingIdRef.current === currentId) {
      return; // Do not reset if ID has not changed (e.g., background polling refresh)
    }
    prevEditingIdRef.current = currentId;

    if (editingKeyword) {
      setIsExpanded(true);
      const kws = editingKeyword.keywords && editingKeyword.keywords.length > 0 
        ? [...editingKeyword.keywords] 
        : (editingKeyword.keyword ? [editingKeyword.keyword] : [""]);
      setNewKeywords(kws);
      setNewReply(editingKeyword.reply || "");
      const links = editingKeyword.message_links && editingKeyword.message_links.length > 0 
        ? [...editingKeyword.message_links] 
        : (editingKeyword.message_link ? [editingKeyword.message_link] : [""]);
      setNewMessageLinks(links);
      setNewMaxReplies(editingKeyword.max_replies !== undefined ? editingKeyword.max_replies : 0);
      setNewMatchMode(editingKeyword.match_mode || 'exact');
      setNewAiReplyEnabled(!!editingKeyword.ai_reply_enabled);
      setNewApprovalMode(!!editingKeyword.approval_mode);
      setNewNotifyOnHit(!!editingKeyword.notify_on_hit);
      setNewTargetGroups(editingKeyword.target_groups || []);
    } else {
      setNewKeywords([""]);
      setNewReply("");
      setNewMessageLinks([""]);
      setNewMaxReplies(0);
      setNewMatchMode('exact');
      setNewAiReplyEnabled(false);
      setNewApprovalMode(false);
      setNewNotifyOnHit(false);
      setNewTargetGroups([]);
    }
  }, [editingKeyword]);

  const addGroup = (group: string) => {
    const splitGroups = group.split(',').map(g => g.trim()).filter(g => g);
    let added = false;
    const nextGroups = [...newTargetGroups];
    const normalize = (id: string) => id.toString().trim().replace(/^-100|^ -100|^-/, "");

    for (const g of splitGroups) {
      if (availableGroups.length > 0) {
        const normG = normalize(g);
        const match = availableGroups.find(ag => ag.id === g || ag.title === g || normalize(ag.id) === normG);
        if (!match) {
          toast.error(`"${g}" Settings mein registered Target Group nahi hai! Sirf Settings wale groups allow hain.`);
          continue;
        }
        if (!nextGroups.includes(match.id)) {
          nextGroups.push(match.id);
          added = true;
        }
      } else {
        toast.error("Pehle Settings mein Target Group IDs configure karein!");
        return;
      }
    }
    if (added) {
      setNewTargetGroups(nextGroups);
      setCustomGroupInput("");
    }
  };

  const removeGroup = (group: string) => {
    setNewTargetGroups(newTargetGroups.filter(g => g !== group));
  };

  const addKeywordField = () => setNewKeywords([...newKeywords, ""]);
  const updateKeywordField = (index: number, value: string) => {
    const updated = [...newKeywords];
    updated[index] = value;
    setNewKeywords(updated);
  };
  const removeKeywordField = (index: number) => {
    if (newKeywords.length > 1) {
      setNewKeywords(newKeywords.filter((_, i) => i !== index));
    }
  };

  const addMessageLinkField = () => setNewMessageLinks([...newMessageLinks, ""]);
  const updateMessageLinkField = (index: number, value: string) => {
    const updated = [...newMessageLinks];
    updated[index] = value;
    setNewMessageLinks(updated);
  };
  const removeMessageLinkField = (index: number) => {
    if (newMessageLinks.length > 1) {
      setNewMessageLinks(newMessageLinks.filter((_, i) => i !== index));
    }
  };

  const handleSave = () => {
    onSave({
      keywords: newKeywords,
      reply: newReply,
      match_mode: newMatchMode,
      message_links: newMessageLinks,
      max_replies: newMaxReplies,
      ai_reply_enabled: newAiReplyEnabled,
      approval_mode: newApprovalMode,
      notify_on_hit: newNotifyOnHit,
      target_groups: newTargetGroups
    });
  };

  return (
    <div 
      className={`p-3.5 rounded-xl border transition duration-300 ${
        darkMode 
          ? 'bg-neutral-900/90 border-blue-500/30 shadow-lg shadow-black/40' 
          : 'bg-white border-blue-200 shadow-lg shadow-blue-500/5'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
            <Plus className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className={`text-xs font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {editingKeyword ? "Edit Auto-Reply Rule" : "Create New Rule"}
            </h2>
            <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Configure keywords, actions, notifications & targets
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button 
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 ${
              darkMode ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {editingKeyword && (
            <button 
              type="button"
              onClick={onCancel} 
              className={`p-1 rounded-md transition ${darkMode ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
              title="Cancel Edit"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Left Column: Keywords & Message */}
              <div className="space-y-3">
                {/* Keywords List */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={`block text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Keywords to Match
                    </label>
                    <div className="flex items-center gap-2">
                      {newKeywords.some(k => k.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            const textToCopy = newKeywords.filter(k => k.trim()).join(', ');
                            navigator.clipboard.writeText(textToCopy);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition flex items-center gap-0.5 border ${
                            darkMode ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          }`}
                          title="Copy typed keywords to clipboard"
                        >
                          <Copy size={10} />
                          <span>Copy List</span>
                        </button>
                      )}
                      <span className={`text-[9px] font-mono ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {newKeywords.filter(k => k.trim()).length} keyword(s)
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {newKeywords.map((kw, index) => (
                      <KeywordInput 
                        key={index}
                        index={index}
                        value={kw}
                        onChange={(val: string) => updateKeywordField(index, val)}
                        onRemove={() => removeKeywordField(index)}
                        showRemove={newKeywords.length > 1}
                        darkMode={darkMode}
                      />
                    ))}
                    <button 
                      type="button"
                      onClick={addKeywordField}
                      className={`w-full py-1.5 border border-dashed rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 ${
                        darkMode 
                          ? 'border-white/10 text-slate-400 hover:border-blue-500/50 hover:text-blue-400 bg-white/[0.02]' 
                          : 'border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 bg-slate-50/50'
                      }`}
                    >
                      <Plus size={12} />
                      <span>Add Another Keyword</span>
                    </button>
                  </div>
                </div>

                {/* Auto Reply Text */}
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Auto-Reply Message
                  </label>
                  <ReplyInput 
                    value={newReply}
                    onChange={setNewReply}
                    darkMode={darkMode}
                  />
                </div>

                {/* Match Mode & Max Replies */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Match Mode
                    </label>
                    <div className={`p-0.5 rounded-lg flex ${darkMode ? 'bg-white/5 border border-white/5' : 'bg-slate-100'}`}>
                      <button 
                        type="button"
                        onClick={() => setNewMatchMode('exact')}
                        className={`flex-1 py-1 px-2 rounded-md text-[10px] font-black uppercase tracking-tight transition ${
                          newMatchMode === 'exact' 
                            ? (darkMode ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-blue-600 shadow-sm') 
                            : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')
                        }`}
                      >
                        Exact
                      </button>
                      <button 
                        type="button"
                        onClick={() => setNewMatchMode('partial')}
                        className={`flex-1 py-1 px-2 rounded-md text-[10px] font-black uppercase tracking-tight transition ${
                          newMatchMode === 'partial' 
                            ? (darkMode ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-blue-600 shadow-sm') 
                            : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')
                        }`}
                      >
                        Partial
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Max Replies / Topic
                    </label>
                    <div className="relative">
                      <Hash size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="number"
                        value={newMaxReplies}
                        onChange={(e) => setNewMaxReplies(e.target.value)}
                        placeholder="0 = Unlimited"
                        className={`w-full pl-7 pr-2.5 py-1 border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-xs transition ${
                          darkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Links, Target Groups & Toggles */}
              <div className="space-y-3">
                {/* Message Links */}
                <div>
                  <label className={`block text-[10px] font-black uppercase tracking-wider mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Telegram Message Link (Forward/Quote)
                  </label>
                  <div className="space-y-1.5">
                    {newMessageLinks.map((link, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <Link size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
                          <input
                            type="text"
                            value={link}
                            onChange={(e) => updateMessageLinkField(index, e.target.value)}
                            placeholder="https://t.me/c/12345/678"
                            className={`w-full pl-7 pr-2.5 py-1.5 border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-xs transition ${
                              darkMode ? 'bg-white/5 border-white/10 text-white placeholder-white/20' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                            }`}
                          />
                        </div>
                        {newMessageLinks.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => removeMessageLinkField(index)} 
                            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button 
                      type="button"
                      onClick={addMessageLinkField}
                      className={`w-full py-1 border border-dashed rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 ${
                        darkMode 
                          ? 'border-white/10 text-slate-400 hover:border-blue-500/50 hover:text-blue-400 bg-white/[0.02]' 
                          : 'border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 bg-slate-50/50'
                      }`}
                    >
                      <Plus size={11} />
                      <span>Add Another Link</span>
                    </button>
                  </div>
                </div>

                {/* Target Groups */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className={`block text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Target Groups
                    </label>
                    <span className={`text-[9px] font-mono font-bold ${
                      newTargetGroups.length === 0 ? 'text-emerald-500' : 'text-indigo-500'
                    }`}>
                      {newTargetGroups.length === 0 ? "All Groups" : `${newTargetGroups.length} Selected`}
                    </span>
                  </div>

                  {/* Manual Add Input */}
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Users size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                      <input
                        type="text"
                        value={customGroupInput}
                        onChange={(e) => setCustomGroupInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGroup(customGroupInput); } }}
                        placeholder="Enter registered Group ID or Name..."
                        className={`w-full pl-7 pr-2.5 py-1.5 border rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-xs transition ${
                          darkMode ? 'bg-white/5 border-white/10 text-white placeholder-white/20' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => addGroup(customGroupInput)}
                      className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg transition flex items-center gap-1 flex-shrink-0"
                    >
                      <Plus size={11} /> Add
                    </button>
                  </div>

                  {/* Available Groups List for Easy 1-Click Multi-Selection */}
                  {availableGroups.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1.5 rounded-lg border bg-black/5 dark:bg-white/5">
                      <button
                        type="button"
                        onClick={() => setNewTargetGroups([])}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 border ${
                          newTargetGroups.length === 0
                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                            : (darkMode ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100')
                        }`}
                      >
                        <Users size={10} />
                        <span>All Groups</span>
                        {newTargetGroups.length === 0 && <Check size={11} className="text-emerald-300" />}
                      </button>
                      {availableGroups.map((g) => {
                        const isSelected = newTargetGroups.includes(g.id) || newTargetGroups.includes(g.title);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleSelectGroup(g.id)}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 border ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                                : (darkMode ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100')
                            }`}
                          >
                            <Users size={10} />
                            <span className="truncate max-w-[140px]">{g.title !== g.id ? g.title : `Group ${g.id}`}</span>
                            {isSelected ? <Check size={11} className="text-emerald-300" /> : <Plus size={10} className="opacity-50" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={`p-2.5 rounded-lg border text-xs ${
                      darkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      <p className="font-bold text-[10.5px]">⚠️ Settings mein koi Target Group ID configure nahi hai</p>
                      <p className="text-[9.5px] opacity-80 mt-0.5">Bot strictly sirf Settings mein add kiye gaye groups mein reply karta hai. Kripya pehle <b>Settings &gt; Target Group IDs</b> mein group add karein.</p>
                    </div>
                  )}

                  {/* Selected Groups Pills */}
                  <div className="space-y-1">
                    <div className={`flex flex-wrap gap-1 p-1.5 rounded-lg border ${
                      newTargetGroups.length === 0 
                        ? 'bg-emerald-500/5 border-emerald-500/20' 
                        : 'bg-indigo-500/5 border-indigo-500/20'
                    }`}>
                      {newTargetGroups.length === 0 ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold shadow-sm ${
                          darkMode ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-400/30' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}>
                          <Users size={11} className="text-emerald-500" />
                          <span>All Target Groups</span>
                        </span>
                      ) : (
                        newTargetGroups.map((grp, idx) => {
                          const displayName = getGroupName(grp);
                          return (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold shadow-sm ${
                                darkMode ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-400/30' : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                              }`}
                            >
                              <Users size={11} className="text-indigo-500" />
                              <span className="truncate max-w-[160px]" title={grp}>{displayName}</span>
                              <button
                                type="button"
                                onClick={() => removeGroup(grp)}
                                className="hover:text-rose-500 transition ml-1 p-0.5"
                                title="Remove group"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* 3 Compact Feature Toggles */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {/* AI Smart Reply */}
                  <button
                    type="button"
                    onClick={() => setNewAiReplyEnabled(!newAiReplyEnabled)}
                    className={`p-2 rounded-lg border text-left transition ${
                      newAiReplyEnabled 
                        ? (darkMode ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700') 
                        : (darkMode ? 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100')
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Sparkles size={13} className={newAiReplyEnabled ? 'text-blue-500' : ''} />
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${newAiReplyEnabled ? 'bg-blue-500 text-white' : (darkMode ? 'bg-white/10 text-slate-400' : 'bg-slate-200 text-slate-600')}`}>
                        {newAiReplyEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[10px] font-black tracking-tight leading-tight">AI Smart</p>
                    <p className={`text-[8px] leading-tight truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Gemini assist</p>
                  </button>

                  {/* Notify on Hit */}
                  <button
                    type="button"
                    onClick={() => setNewNotifyOnHit(!newNotifyOnHit)}
                    className={`p-2 rounded-lg border text-left transition ${
                      newNotifyOnHit 
                        ? (darkMode ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700') 
                        : (darkMode ? 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100')
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Bell size={13} className={newNotifyOnHit ? 'text-emerald-500 animate-pulse' : ''} />
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${newNotifyOnHit ? 'bg-emerald-500 text-white' : (darkMode ? 'bg-white/10 text-slate-400' : 'bg-slate-200 text-slate-600')}`}>
                        {newNotifyOnHit ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[10px] font-black tracking-tight leading-tight">Notify</p>
                    <p className={`text-[8px] leading-tight truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Push alert</p>
                  </button>

                  {/* Approval Mode */}
                  <button
                    type="button"
                    onClick={() => setNewApprovalMode(!newApprovalMode)}
                    className={`p-2 rounded-lg border text-left transition ${
                      newApprovalMode 
                        ? (darkMode ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700') 
                        : (darkMode ? 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100')
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Zap size={13} className={newApprovalMode ? 'text-amber-500' : ''} />
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${newApprovalMode ? 'bg-amber-500 text-slate-950 font-black' : (darkMode ? 'bg-white/10 text-slate-400' : 'bg-slate-200 text-slate-600')}`}>
                        {newApprovalMode ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[10px] font-black tracking-tight leading-tight">Approval</p>
                    <p className={`text-[8px] leading-tight truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ask before send</p>
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-3.5 pt-2.5 border-t border-white/5 flex gap-2">
              <button 
                type="button"
                onClick={handleSave}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-3 rounded-lg font-black uppercase tracking-wider text-[10px] shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5"
              >
                <Zap size={12} />
                <span>{editingKeyword ? "Update Rule" : "Save Rule"}</span>
              </button>
              {editingKeyword && (
                <button 
                  type="button"
                  onClick={onCancel}
                  className={`px-3 py-1.5 rounded-lg font-black uppercase tracking-wider text-[10px] transition ${
                    darkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(AddKeywordSection);
