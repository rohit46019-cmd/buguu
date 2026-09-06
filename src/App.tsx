import React, { useState, useEffect, useRef, useDeferredValue, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Toaster, toast } from 'react-hot-toast';
import { apiFetch, apiJson, invalidateApiCache } from './lib/api';
import { Skeleton } from './components/Skeleton';
import Dashboard from './components/Dashboard';
import KeywordsManager from './components/KeywordsManager';
import SettingsPanel from './components/SettingsPanel';
import CatchUpPage from './components/CatchUpPage';
import NotificationPanel from './components/NotificationPanel';
import PhotoStats from './components/PhotoStats';
import ActivityLogs from './components/ActivityLogs';
import BroadcastPanel from './components/BroadcastPanel';
import AutoBlockManager from './components/AutoBlockManager';
import Analytics from './components/Analytics';
import Tester from './components/Tester';
import Insights from './components/Insights';
import MediaManager from './components/MediaManager';
import UserManager from './components/UserManager';
import AddKeywordSection from './components/AddKeywordSection';
import ApprovalDashboard from './components/ApprovalDashboard';
import ProfileSelector from './components/ProfileSelector';
import { LogoSelectorModal } from './components/LogoSelectorModal';
import { InstallAppModal } from './components/InstallAppModal';
import { pingDeviceSession } from './utils/deviceTracker';
import { 
  MessageSquare, 
  LayoutGrid,
  Send, 
  Settings, 
  BarChart3, 
  Bell, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  User,
  Key,
  Smartphone,
  Lock,
  Hash,
  Plus,
  Trash2,
  LayoutDashboard,
  Sun,
  Moon,
  MoonStar,
  SunMedium,
  SunMoon,
  Image as ImageIcon,
  X,
  Search,
  Folder,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  FileText,
  Download,
  Upload,
  Play,
  Pause,
  ShieldAlert,
  ShieldCheck,
  Link,
  RotateCcw,
  Copy,
  ChevronDown,
  ChevronUp,
  PieChart,
  Bot,
  MessageCircle,
  MoreVertical,
  Calendar,
  Users,
  Database,
  Library,
  Trash,
  Sparkles,
  Zap,
  Check,
  Grip,
  Menu,
  Save,
  LogOut,
  ExternalLink,
  Image,
  Home,
  MessageSquareText,
  Megaphone,
  SlidersHorizontal,
  Terminal,
  Radio,
  Activity
} from "lucide-react";
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';

interface Stats {
  topicCount: number;
  appLogo?: string;
  todayTopicCount: number;
  todayPhotoSentStats?: {
    count: number;
    topics: { name: string; link: string; time: string }[];
  };
  past24hPhotoSentStats?: {
    count: number;
    topics: { name: string; link: string; time: string }[];
  };
  keywordCount: number;
  autoReply: string;
  delaySeconds: number;
  keywordDelaySeconds: number;
  isSystemPaused: boolean;
  photoReplyEnabled: boolean;
  photoReplyMessage: string;
  photoReplyMax: number;
  notificationSoundEnabled: boolean;
  notificationSoundType: string;
  isUserBotConnected: boolean;
  apiId: string;
  apiHash: string;
  defaultPhone: string;
  topicIcon: string;
  topicRenameEmoji: string;
  topicRenameKeywords: string;
  topicRenameMatchMode: 'exact' | 'partial';
  autoResetKeywords: boolean;
  autoBlockKeywords: string; // JSON string
  aiModeEnabled: boolean;
  aiPersona: string;
  geminiApiKeys: string; // JSON string
  replyInGeneral: boolean;
  telegram_bot_token?: string;
  sessionStartTime: number | null;
  lastLoginTime: string;
  loginUser?: {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
  };
}

interface AutoBlockKeyword {
  keyword: string;
  matchMode: 'exact' | 'partial';
}

interface Keyword {
  _id: string;
  keyword: string; // Legacy
  keywords?: string[]; // New array
  reply: string;
  photo?: string;
  message_link?: string;
  message_links?: string[];
  max_replies?: number;
  match_mode?: 'exact' | 'partial';
  ai_reply_enabled?: boolean;
  notify_on_hit?: boolean;
  enabled?: boolean;
  approval_mode?: boolean;
  target_groups?: string[];
}

interface Topic {
  _id: string;
  telegram_topic_id: number;
  name: string;
  created_at: string;
}

interface AppLog {
  _id: string;
  level: 'info' | 'error' | 'warn';
  category?: string;
  message: string;
  details?: string;
  route?: string;
  timestamp: string;
}

interface MediaItem {
  _id: string;
  url: string;
  name: string;
  type: string;
  created_at: string;
}

interface LeaderboardItem {
  username: string;
  count: number;
  avatar?: string;
}

interface HeatmapItem {
  day: string;
  hour: number;
  value: number;
}

const TABS = [
  'dashboard',   // 0: Home
  'keywords',    // 1: Rules
  'approvals',   // 2: Check
  'broadcast',   // 3: Cast
  'settings',    // 4: Settings
  'analytics',   // 5
  'tester',      // 6
  'media',       // 7
  'insights',    // 8
  'user',        // 9
  'logs',        // 10
  'photo_stats', // 11
  'catchup',     // 12
] as const;
type TabType = typeof TABS[number];

const TabButton = ({ 
  id, 
  icon: Icon, 
  label, 
  activeTab, 
  setActiveTab, 
  setDirection, 
  darkMode 
}: { 
  id: TabType, 
  icon: any, 
  label: string,
  activeTab: TabType,
  setActiveTab: (id: TabType) => void,
  setDirection: (dir: number) => void,
  darkMode: boolean
}) => {
  const isActive = activeTab === id;
  const colors: Record<TabType, { bg: string, text: string, glow: string, ring: string }> = {
    dashboard: { bg: 'from-blue-600 via-indigo-600 to-violet-600', text: 'text-indigo-400', glow: 'shadow-indigo-500/40', ring: 'ring-indigo-500/40' },
    keywords: { bg: 'from-fuchsia-600 via-purple-600 to-indigo-600', text: 'text-fuchsia-400', glow: 'shadow-fuchsia-500/40', ring: 'ring-purple-500/40' },
    approvals: { bg: 'from-emerald-500 via-teal-500 to-cyan-600', text: 'text-emerald-400', glow: 'shadow-emerald-500/40', ring: 'ring-emerald-500/40' },
    broadcast: { bg: 'from-amber-500 via-orange-500 to-rose-600', text: 'text-orange-400', glow: 'shadow-orange-500/40', ring: 'ring-orange-500/40' },
    settings: { bg: 'from-cyan-500 via-sky-500 to-blue-600', text: 'text-cyan-400', glow: 'shadow-cyan-500/40', ring: 'ring-cyan-500/40' },
    analytics: { bg: 'from-cyan-400 to-cyan-600', text: 'text-cyan-400', glow: 'shadow-cyan-500/40', ring: 'ring-cyan-500/30' },
    tester: { bg: 'from-orange-400 to-orange-600', text: 'text-orange-400', glow: 'shadow-orange-500/40', ring: 'ring-orange-500/30' },
    user: { bg: 'from-pink-400 to-pink-600', text: 'text-pink-400', glow: 'shadow-pink-500/40', ring: 'ring-pink-500/30' },
    logs: { bg: 'from-slate-400 to-slate-600', text: 'text-slate-400', glow: 'shadow-slate-500/40', ring: 'ring-slate-500/30' },
    media: { bg: 'from-indigo-400 to-indigo-600', text: 'text-indigo-400', glow: 'shadow-indigo-500/40', ring: 'ring-indigo-500/30' },
    insights: { bg: 'from-rose-400 to-rose-600', text: 'text-rose-400', glow: 'shadow-rose-500/40', ring: 'ring-rose-500/30' },
    photo_stats: { bg: 'from-amber-400 to-amber-600', text: 'text-amber-400', glow: 'shadow-amber-500/40', ring: 'ring-amber-500/30' },
    catchup: { bg: 'from-rose-400 to-rose-600', text: 'text-rose-400', glow: 'shadow-rose-500/40', ring: 'ring-rose-500/30' }
  };

  const theme = colors[id] || colors.dashboard;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        const currentIndex = TABS.indexOf(activeTab);
        const newIndex = TABS.indexOf(id);
        if (currentIndex !== newIndex) {
          setDirection(newIndex > currentIndex ? 1 : -1);
          setActiveTab(id);
        }
      }}
      className={`flex flex-col items-center justify-center py-1 px-1.5 sm:px-2.5 rounded-2xl transition-all duration-300 relative group cursor-pointer ${
        isActive 
          ? (darkMode ? "text-white" : "text-slate-900") 
          : (darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900")
      }`}
    >
      <div className={`p-1.5 sm:p-2 rounded-xl transition-all duration-300 flex items-center justify-center relative ${
        isActive 
          ? `bg-gradient-to-tr ${theme.bg} text-white shadow-lg ${theme.glow} scale-110 ring-2 ${theme.ring}` 
          : `group-hover:bg-slate-800/30 dark:group-hover:bg-white/10`
      }`}>
        <Icon strokeWidth={isActive ? 2.5 : 2} className={`w-4 h-4 transition-transform duration-300 ${isActive ? "scale-105" : ""}`} />
      </div>
      <span className={`text-[9.5px] font-bold tracking-tight mt-1 transition-all ${
        isActive 
          ? `${darkMode ? 'text-white font-black' : 'text-slate-950 font-black'}` 
          : "opacity-65"
      }`}>
        {label}
      </span>
      {isActive && (
        <motion.div 
          layoutId="activeTabIndicator"
          className={`absolute -bottom-0.5 w-4 h-0.5 bg-gradient-to-r ${theme.bg} rounded-full`}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </motion.button>
  );
};

const useDebounce = (value: any, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

export function useCachedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const profileId = localStorage.getItem('currentProfileId') || 'default';
  const scopedKey = `${profileId}_${key}`;
  
  const [state, setState] = useState<T>(() => {
    try {
      const cached = localStorage.getItem(scopedKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn('Error reading from localStorage', e);
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(scopedKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Error writing to localStorage', e);
    }
  }, [scopedKey, state]);

  return [state, setState];
}

// Global fetch interceptor to inject x-account-id automatically for all API requests
if (typeof window !== "undefined") {
  try {
    const originalFetch = window.fetch;
    const customFetch = async function (input: any, init: any) {
      const activeAccId = localStorage.getItem('currentProfileId') || localStorage.getItem('activeAccountId') || 'default';
      let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
      if (url.startsWith('/api') || url.includes('/api/')) {
        init = init || {};
        if (input instanceof Request) {
          try {
            if (!input.headers.has('x-account-id')) {
              input.headers.set('x-account-id', activeAccId);
            }
          } catch (e) {
            // If Request headers are read-only or immutable, clone the Request with the header
            try {
              const newHeaders = new Headers(input.headers);
              newHeaders.set('x-account-id', activeAccId);
              input = new Request(input, { headers: newHeaders });
            } catch (err) {}
          }
        } else {
          const headers = init.headers || {};
          if (headers instanceof Headers) {
            if (!headers.has('x-account-id')) {
              headers.set('x-account-id', activeAccId);
            }
            init.headers = headers;
          } else if (Array.isArray(headers)) {
            const hasHeader = headers.some(([k]) => k.toLowerCase() === 'x-account-id');
            if (!hasHeader) {
              headers.push(['x-account-id', activeAccId]);
            }
            init.headers = headers;
          } else if (typeof headers === 'object') {
            const hasHeader = Object.keys(headers).some(k => k.toLowerCase() === 'x-account-id');
            if (!hasHeader) {
              (headers as any)['x-account-id'] = activeAccId;
            }
            init.headers = headers;
          }
        }
      }
      return originalFetch(input, init);
    };

    try {
      window.fetch = customFetch;
    } catch (assignError) {
      Object.defineProperty(window, 'fetch', {
        value: customFetch,
        writable: true,
        configurable: true
      });
    }
  } catch (err) {
    console.warn("Failed to intercept window.fetch globally, proceeding safely.", err);
  }
}

export default function App() {
  const [currentProfileId, setCurrentProfileId] = useState(() => localStorage.getItem('currentProfileId') || 'default');

  useEffect(() => {
    let deviceId = localStorage.getItem('botflow_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem('botflow_device_id', deviceId);
    }

    const sendHeartbeat = async () => {
      try {
        const activeAcc = localStorage.getItem('currentProfileId') || 'default';
        await fetch('/api/device/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-account-id': activeAcc,
            'x-device-id': deviceId!
          },
          body: JSON.stringify({
            deviceId,
            accountId: activeAcc
          })
        }).catch(() => {});
      } catch (e) {}
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 30000);

    const handleAccountChanged = (e: any) => {
      const newId = e.detail?.accountId || 'default';
      setCurrentProfileId(newId);
      sendHeartbeat();
      // Re-register push subscription for the switched account
      subscribeToPush(true);
    };
    window.addEventListener('account_changed', handleAccountChanged);
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('account_changed', handleAccountChanged);
    };
  }, []);

  const [stats, setStats] = useCachedState<Stats | null>("botflow_stats", null);
  const [targetGroupId, setTargetGroupId] = useCachedState("botflow_targetGroupId", "");
  const [telegramBotToken, setTelegramBotToken] = useCachedState("botflow_telegramBotToken", "");
  const [autoReplyInput, setAutoReplyInput] = useCachedState("botflow_autoReplyInput", "");
  const [appLogoInput, setAppLogoInput] = useCachedState("botflow_appLogoInput", "");
  const [autoReply2Enabled, setAutoReply2Enabled] = useCachedState("botflow_autoReply2Enabled", false);
  const [autoReply2Input, setAutoReply2Input] = useCachedState("botflow_autoReply2Input", "");
  const [autoReply2DelayInput, setAutoReply2DelayInput] = useCachedState("botflow_autoReply2DelayInput", 1);
  const [delaySecondsInput, setDelaySecondsInput] = useCachedState("botflow_delaySecondsInput", 0);
  const [keywordDelaySecondsInput, setKeywordDelaySecondsInput] = useCachedState("botflow_keywordDelaySecondsInput", 0);
  const [apiIdInput, setApiIdInput] = useCachedState("botflow_apiIdInput", "");
  const [apiHashInput, setApiHashInput] = useCachedState("botflow_apiHashInput", "");
  const [photoReplyEnabled, setPhotoReplyEnabled] = useCachedState("botflow_photoReplyEnabled", false);
  const [photoReplyMessage, setPhotoReplyMessage] = useCachedState("botflow_photoReplyMessage", "");
  const [photoReplyMessage2Enabled, setPhotoReplyMessage2Enabled] = useCachedState("botflow_photoReplyMessage2Enabled", false);
  const [photoReplyMessage2, setPhotoReplyMessage2] = useCachedState("botflow_photoReplyMessage2", "");
  const [topicIcon, setTopicIcon] = useCachedState("botflow_topicIcon", "✅");
  const [topicRenameEmoji, setTopicRenameEmoji] = useCachedState("botflow_topicRenameEmoji", "🛑");
  const [topicRenameKeywords, setTopicRenameKeywords] = useCachedState("botflow_topicRenameKeywords", "");
  const [topicRenameMatchMode, setTopicRenameMatchMode] = useCachedState<'exact' | 'partial'>("botflow_topicRenameMatchMode", 'exact');
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useCachedState("botflow_notificationSoundEnabled", true);
  const [notificationSoundType, setNotificationSoundType] = useCachedState("botflow_notificationSoundType", "default");
  const [autoResetKeywords, setAutoResetKeywords] = useCachedState("botflow_autoResetKeywords", true);
  const [autoBlockKeywords, setAutoBlockKeywords] = useCachedState<AutoBlockKeyword[]>("botflow_autoBlockKeywords", []);
  const [aiModeEnabled, setAiModeEnabled] = useCachedState("botflow_aiModeEnabled", false);
  const [aiPersona, setAiPersona] = useCachedState("botflow_aiPersona", "");
  const [geminiApiKeys, setGeminiApiKeys] = useCachedState<string[]>("botflow_geminiApiKeys", []);
  const [replyInGeneral, setReplyInGeneral] = useCachedState("botflow_replyInGeneral", false);
  
  const [analyticsData, setAnalyticsData] = useCachedState<{keywordData: any[], topicData: any[]}>("botflow_analytics", { keywordData: [], topicData: [] });
  const [newBlockedTopicLink, setNewBlockedTopicLink] = useState("");
  const [blockingTopic, setBlockingTopic] = useState(false);
  const [photoReplyMessage2StartTime, setPhotoReplyMessage2StartTime] = useState("");
  const [photoReplyMessage2EndTime, setPhotoReplyMessage2EndTime] = useState("");
  const [photoReplyMax, setPhotoReplyMax] = useState<number | string>(2);
  const [keywordSearch, setKeywordSearch] = useCachedState("botflow_keywordSearch", "");
  const deferredKeywordSearch = useDeferredValue(keywordSearch);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isAddingNewRule, setIsAddingNewRule] = useState(false);
  const [blockedTopicSearch, setBlockedTopicSearch] = useState("");
  const [autoBlockKeywordsExpanded, setAutoBlockKeywordsExpanded] = useState(false);
  const [photoStatsTab, setPhotoStatsTab] = useState<'today' | '24h'>('today');

  const [broadcastMessage, setBroadcastMessage] = useCachedState("botflow_broadcastMessage", "");
  const [broadcastTarget, setBroadcastTarget] = useCachedState<'all' | 'general'>("botflow_broadcastTarget", 'all');
  const [broadcastProgress, setBroadcastProgress] = useCachedState("botflow_broadcastProgress", { total: 0, current: 0, status: 'idle' });
  const [keywords, setKeywords] = useCachedState<Keyword[]>("botflow_keywords", []);
  const [logs, setLogs] = useCachedState<AppLog[]>("botflow_logs", []);
  const [logSearch, setLogSearch] = useCachedState("botflow_logSearch", "");
  const debouncedLogSearch = useDebounce(logSearch, 300);
  const [logLevelFilter, setLogLevelFilter] = useCachedState("botflow_logLevelFilter", "all");
  const [logCategoryFilter, setLogCategoryFilter] = useCachedState("botflow_logCategoryFilter", "all");
  const [expandedLogId, setExpandedLogId] = useCachedState<string | null>("botflow_expandedLogId", null);
  const [visibleLogsCount, setVisibleLogsCount] = useCachedState("botflow_visibleLogsCount", 100);
  const [keywordFilter, setKeywordFilter] = useCachedState<'all' | 'active' | 'inactive' | 'forward' | 'message' | 'highest' | 'lowest' | 'approval' | 'notify'>("botflow_keywordFilter", 'all');
  const debouncedKeywordSearch = useDebounce(keywordSearch, 300);
  const [expandedKeywordId, setExpandedKeywordId] = useCachedState<string | null>("botflow_expandedKeywordId", null);
  const [visibleKeywordsCount, setVisibleKeywordsCount] = useCachedState("botflow_visibleKeywordsCount", 50);
  const [blockedTopics, setBlockedTopics] = useCachedState<any[]>("botflow_blockedTopics", []);
  
  const [testMessage, setTestMessage] = useState("");
  const [testReply, setTestReply] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [aiSuggestionsError, setAiSuggestionsError] = useState("");
  const [addedSuggestions, setAddedSuggestions] = useState<string[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [userLeaderboard, setUserLeaderboard] = useState<LeaderboardItem[]>([]);
  const [activityHeatmap, setActivityHeatmap] = useState<HeatmapItem[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaName, setNewMediaName] = useState("");
  
  const [missedCount, setMissedCount] = useState(0);
  const [missedList, setMissedList] = useState<any[]>([]);
  const [isFetchingMissed, setIsFetchingMissed] = useState(false);
  const [isCatchingUp, setIsCatchingUp] = useState(false);
  const [isScanningMissed, setIsScanningMissed] = useState(false);
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [selectedScannedItems, setSelectedScannedItems] = useState<Set<string>>(new Set());
  const [showScanModal, setShowScanModal] = useState(false);
  const [replyingIds, setReplyingIds] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [direction, setDirection] = useState(0);
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchEnd, setTouchEnd] = useState({ x: 0, y: 0 });
  const [refreshingLogs, setRefreshingLogs] = useState(false);
  const [editingKeywordId, setEditingKeywordId] = useState<string | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [showPauseConfirmation, setShowPauseConfirmation] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [showDeleteLastKeywordConfirm, setShowDeleteLastKeywordConfirm] = useState(false);
  const [showDeleteLastRuleConfirm, setShowDeleteLastRuleConfirm] = useState(false);
  const [lastImportInfo, setLastImportInfo] = useState<{ hasLastImport: boolean; count: number; importedAt: string | null; names?: string[]; latestRuleName?: string; totalRules?: number } | null>(null);
  const [importBatches, setImportBatches] = useState<Array<{
    id: string;
    batchId: string;
    fileName: string;
    importedAt: string;
    count: number;
    names: string[];
  }>>([]);
  const [isFetchingBatches, setIsFetchingBatches] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<{ batchId: string; fileName: string; count: number } | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [deletingLastImport, setDeletingLastImport] = useState(false);
  const [deletingLastRule, setDeletingLastRule] = useState(false);
  const [showResetKeywordsConfirm, setShowResetKeywordsConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeenLogCount, setLastSeenLogCount] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const keywordsTopRef = useRef<HTMLDivElement>(null);
  const keywordsBottomRef = useRef<HTMLDivElement>(null);
  const castTopRef = useRef<HTMLDivElement>(null);
  const castBottomRef = useRef<HTMLDivElement>(null);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("darkMode");
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      console.error("Error parsing darkMode from localStorage", e);
      return true;
    }
  });

  const [notificationStyle, setNotificationStyle] = useState<string>(() => {
    try {
      return localStorage.getItem("notificationStyle") || "minimalist";
    } catch (e) {
      return "minimalist";
    }
  });

  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  useEffect(() => {
    if (stats?.sessionStartTime) {
      setSessionStartTime(stats?.sessionStartTime);
    }
  }, [stats?.sessionStartTime]);

  useEffect(() => {
    if (!sessionStartTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  useEffect(() => {
    if (isNotificationOpen) {
      setUnreadCount(0);
      setLastSeenLogCount(logs.length);
    }
  }, [isNotificationOpen, logs.length]);

  useEffect(() => {
    if (!isNotificationOpen && logs.length > lastSeenLogCount) {
      const newLogs = logs.slice(lastSeenLogCount);
      const newNotificationLogs = newLogs.filter((l: any) => 
        l.message.toLowerCase().includes('photo') || 
        l.message.toLowerCase().includes('block')
      );
      if (newNotificationLogs.length > 0) {
        setUnreadCount(prev => prev + newNotificationLogs.length);
      }
      setLastSeenLogCount(logs.length);
    }
  }, [logs, isNotificationOpen, lastSeenLogCount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      setIsInstallModalOpen(true);
      return;
    }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } catch (e) {
      setIsInstallModalOpen(true);
    }
  };

  const handleSaveLogo = async (logoUrl: string) => {
    setAppLogoInput(logoUrl);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appLogo: logoUrl })
      });
      if (res.ok) {
        showNotification('success', 'App logo saved successfully!');
        fetchStats();
      } else {
        showNotification('error', 'Failed to save logo');
      }
    } catch (e) {
      showNotification('error', 'Network error saving logo');
    }
  };

  // Automatically synchronize app icon to browser tab, home screen, and PWA manifest when changed in settings
  useEffect(() => {
    const currentLogo = appLogoInput || stats?.appLogo || '/pwa-192x192.png';
    const iconHref = currentLogo.startsWith('data:') ? currentLogo : currentLogo;
    
    // 1. Update or create standard favicon
    let linkIcon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!linkIcon) {
      linkIcon = document.createElement("link");
      linkIcon.rel = "icon";
      document.head.appendChild(linkIcon);
    }
    linkIcon.href = iconHref;
    linkIcon.type = currentLogo.endsWith('.svg') ? 'image/svg+xml' : 'image/png';

    // 2. Update shortcut icon
    let linkShortcut = document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']");
    if (linkShortcut) {
      linkShortcut.href = iconHref;
    }

    // 3. Update Apple touch icon (used by iOS & Android Home screen shortcuts)
    const appleIcons = document.querySelectorAll<HTMLLinkElement>("link[rel='apple-touch-icon']");
    if (appleIcons.length > 0) {
      appleIcons.forEach(el => { el.href = iconHref; });
    } else {
      const linkApple = document.createElement("link");
      linkApple.rel = "apple-touch-icon";
      linkApple.href = iconHref;
      document.head.appendChild(linkApple);
    }

    // 4. Update manifest link with timestamp to trigger immediate browser re-indexing
    const manifestLink = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    if (manifestLink) {
      manifestLink.href = `/manifest.json?t=${Date.now()}`;
    }
  }, [appLogoInput, stats?.appLogo]);

  const formatTime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return {
      days: d,
      time: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    };
  };

  const timer = formatTime(elapsedTime);

  const scrollToKeywordsTop = () => {
    keywordsTopRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToKeywordsBottom = () => {
    keywordsBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToCastTop = () => {
    castTopRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToCastBottom = () => {
    castBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Mock data for insights
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const mockHeatmap: HeatmapItem[] = [];
    days.forEach(day => {
      for (let hour = 0; hour < 24; hour++) {
        mockHeatmap.push({
          day,
          hour,
          value: Math.floor(Math.random() * 10)
        });
      }
    });
    setActivityHeatmap(mockHeatmap);

    setUserLeaderboard([
      { username: 'alex_tg', count: 142 },
      { username: 'sarah_dev', count: 98 },
      { username: 'mike_bot', count: 76 },
      { username: 'julia_q', count: 54 },
      { username: 'ryan_x', count: 32 }
    ]);

    setMediaItems([
      { _id: '1', name: 'Welcome Banner', url: 'https://picsum.photos/seed/welcome/800/400', type: 'image', created_at: new Date().toISOString() },
      { _id: '2', name: 'Price List', url: 'https://picsum.photos/seed/price/800/600', type: 'image', created_at: new Date().toISOString() },
      { _id: '3', name: 'Promo Offer', url: 'https://picsum.photos/seed/promo/800/400', type: 'image', created_at: new Date().toISOString() }
    ]);
  }, []);

  const handleAddMedia = () => {
    if (!newMediaUrl.trim() || !newMediaName.trim()) return;
    const newItem: MediaItem = {
      _id: Date.now().toString(),
      name: newMediaName,
      url: newMediaUrl,
      type: 'image',
      created_at: new Date().toISOString()
    };
    setMediaItems([newItem, ...mediaItems]);
    setNewMediaUrl("");
    setNewMediaName("");
    showNotification('success', 'Media added to library');
  };

  const handleDeleteMedia = (id: string) => {
    setMediaItems(mediaItems.filter(item => item._id !== id));
    showNotification('success', 'Media removed');
  };

  const handleExportConfig = () => {
    const config = {
      keywords,
      settings: stats,
      autoBlockKeywords,
      aiPersona
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `userbot-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showNotification('success', 'Configuration exported');
  };

  const fetchBlockedTopics = React.useCallback(async () => {
    try {
      const res = await apiJson('/api/blocked-topics');
      if (res.ok && Array.isArray(res.data)) {
        setBlockedTopics(res.data);
      }
    } catch (err: any) {
      if (err.message !== "Failed to fetch") {
        console.error("Failed to fetch blocked topics:", err);
      }
    }
  }, []);

  const handleBlockTopic = async () => {
    if (!newBlockedTopicLink) return;
    setBlockingTopic(true);
    try {
      const res = await apiFetch('/api/blocked-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: newBlockedTopicLink }),
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (res.ok) {
        if (data.action === 'unblocked') {
          showNotification('success', 'Topic unblocked successfully');
        } else {
          showNotification('success', `Topic "${data.name}" blocked successfully`);
        }
        setNewBlockedTopicLink("");
        invalidateApiCache('/api/blocked-topics');
        fetchBlockedTopics();
      } else {
        showNotification('error', data.error || 'Failed to process request');
      }
    } catch (err) {
      showNotification('error', 'Failed to process request');
    } finally {
      setBlockingTopic(false);
    }
  };

  const handleUnblockTopic = async (id: string, name?: string) => {
    if (!confirm(`Are you sure you want to unblock ${name || 'this topic'}?`)) return;
    try {
      const response = await apiFetch(`/api/blocked-topics/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        showNotification('success', 'Topic unblocked successfully');
        invalidateApiCache('/api/blocked-topics');
        fetchBlockedTopics();
      }
    } catch (err) {
      showNotification('error', 'Failed to unblock topic');
    }
  };

  const showNotification = (type: 'success' | 'error' | 'warn', message: string, duration = 3000) => {
    // If default style, fallback to react-hot-toast standard
    if (notificationStyle === 'default') {
      if (type === 'success') {
        toast.success(message, { duration });
      } else if (type === 'error') {
        toast.error(message, { duration: 6000 });
      } else {
        toast(message, { duration: 6000, icon: '⚠️' });
      }
      return;
    }

    // Custom Styled Toasts based on user selection
    toast.custom((t) => {
      const isVisible = t.visible;
      const baseAnim = isVisible ? 'animate-enter' : 'animate-leave';

      switch (notificationStyle) {
        case 'glassmorphic':
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-3.5 rounded-xl border backdrop-blur-md shadow-xl flex items-center gap-3 transition-all ${
              darkMode ? 'bg-black/65 border-white/10 text-white shadow-purple-500/5' : 'bg-white/65 border-slate-200/55 text-slate-900 shadow-slate-200/30'
            }`}>
              <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : type === 'error' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
              }`}>
                {type === 'success' ? '✦' : type === 'error' ? '✕' : '⚠️'}
              </div>
              <div className="flex-1 text-[11px] font-medium tracking-wide leading-relaxed break-words">{message}</div>
            </div>
          );
        case 'neobrutalist':
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-3 border-2 border-black font-mono flex items-center gap-3 shadow-[3px_3px_0px_#000000] ${
              type === 'success' ? 'bg-lime-400 text-black' : type === 'error' ? 'bg-rose-400 text-black' : 'bg-amber-400 text-black'
            }`}>
              <span className="font-bold text-sm flex-shrink-0">{type === 'success' ? '✦' : type === 'error' ? '✕' : '⚠'}</span>
              <div className="flex-1 text-[11px] font-black tracking-tight uppercase break-words leading-tight">{message}</div>
            </div>
          );
        case 'cyberpunk':
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-3 rounded-none bg-zinc-950 border border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)] flex items-center gap-3 font-mono text-cyan-400`}>
              <div className="relative flex h-2 w-2 flex-shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  type === 'success' ? 'bg-cyan-400' : type === 'error' ? 'bg-rose-500' : 'bg-amber-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  type === 'success' ? 'bg-cyan-400' : type === 'error' ? 'bg-rose-500' : 'bg-amber-400'
                }`} />
              </div>
              <div className="flex-1 text-[10px] font-bold tracking-widest uppercase break-words leading-tight">{message}</div>
            </div>
          );
        case 'terminal':
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-2.5 rounded-xs bg-black border border-emerald-500/30 flex items-start gap-2 font-mono text-[11px] text-emerald-400 shadow-[inset_0_0_15px_rgba(16,185,129,0.05)]`}>
              <span className="text-emerald-500 animate-pulse font-bold flex-shrink-0">{'>'}</span>
              <div className="flex-1 leading-normal tracking-wide break-words">
                <span className="text-emerald-600 mr-1 font-black">[sys_{type}]</span>
                {message}
              </div>
            </div>
          );
        case 'gradient':
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl flex items-center gap-3 border border-white/20 text-white relative overflow-hidden`}>
              <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px] pointer-events-none" />
              <div className="relative z-10 p-1 bg-white/15 rounded-lg flex-shrink-0 text-sm text-white flex items-center justify-center">
                {type === 'success' ? '✦' : type === 'error' ? '✕' : '⚠️'}
              </div>
              <div className="relative z-10 flex-1 text-[11px] font-bold leading-normal break-words">{message}</div>
            </div>
          );
        case 'compact-pill':
          return (
            <div className={`${baseAnim} max-w-xs mx-auto py-1.5 px-3 rounded-full border shadow-sm flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${
              darkMode 
                ? 'bg-neutral-900/95 border-white/10 text-slate-300' 
                : 'bg-white/95 border-slate-200 text-slate-700'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-rose-500' : 'bg-amber-500'
              }`} />
              <span className="break-words leading-none">{message}</span>
            </div>
          );
        case 'organic':
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-3 rounded-lg bg-[#FAF6F0] border border-[#E6DFD5] text-[#3F3B35] flex items-center gap-3 shadow-xs font-serif`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                type === 'success' ? 'bg-[#5B7065]' : type === 'error' ? 'bg-[#C17D7D]' : 'bg-[#D2B48C]'
              }`} />
              <div className="flex-1 text-[11px] font-medium tracking-tight italic break-words leading-relaxed">{message}</div>
            </div>
          );
        case 'luxury-gold':
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-3.5 rounded-lg bg-slate-950 border border-amber-500/40 shadow-[0_4px_12px_rgba(245,158,11,0.08)] flex items-center gap-3.5`}>
              <div className={`w-1 h-6 flex-shrink-0 rounded-sm ${
                type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-rose-500' : 'bg-gradient-to-b from-amber-300 to-amber-600'
              }`} />
              <div className="flex-1 text-xs font-serif tracking-wide text-amber-100 italic leading-normal break-words">{message}</div>
            </div>
          );
        case 'dynamic-island':
          return (
            <div className={`${baseAnim} max-w-xs mx-auto py-2 px-4 rounded-full bg-black border border-neutral-800 text-white shadow-2xl flex items-center gap-2.5 transition-all duration-300 transform hover:scale-105`}>
              <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  type === 'success' ? 'bg-emerald-400' : type === 'error' ? 'bg-rose-400' : 'bg-amber-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  type === 'success' ? 'bg-emerald-400' : type === 'error' ? 'bg-rose-400' : 'bg-amber-400'
                }`} />
              </span>
              <div className="text-[10px] font-black tracking-tight uppercase break-words leading-none">{message}</div>
            </div>
          );
        case 'minimalist':
        default:
          return (
            <div className={`${baseAnim} max-w-xs sm:max-w-sm w-full p-2.5 rounded-lg border shadow-xs flex items-center gap-2.5 transition-all ${
              darkMode ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}>
              <div className={`w-1 h-6 rounded-full flex-shrink-0 ${
                type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-rose-500' : 'bg-amber-500'
              }`} />
              <div className="flex-1 text-[11.5px] font-bold leading-normal break-words">{message}</div>
            </div>
          );
      }
    }, { duration });
  };

  // Notification Sound
  const playNotificationSound = (type = notificationSoundType) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      const now = audioContext.currentTime;

      switch (type) {
        case 'bell':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, now);
          oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.5);
          gainNode.gain.setValueAtTime(0.5, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          oscillator.start(now);
          oscillator.stop(now + 0.5);
          break;
        case 'chime':
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(660, now);
          oscillator.frequency.setValueAtTime(880, now + 0.1);
          oscillator.frequency.setValueAtTime(1100, now + 0.2);
          gainNode.gain.setValueAtTime(0.3, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          oscillator.start(now);
          oscillator.stop(now + 0.4);
          break;
        case 'ping':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(1200, now);
          gainNode.gain.setValueAtTime(0.4, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;
        case 'digital':
          oscillator.type = 'square';
          oscillator.frequency.setValueAtTime(400, now);
          oscillator.frequency.setValueAtTime(600, now + 0.05);
          oscillator.frequency.setValueAtTime(400, now + 0.1);
          gainNode.gain.setValueAtTime(0.2, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;
        case 'rising':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(200, now);
          oscillator.frequency.exponentialRampToValueAtTime(1000, now + 0.3);
          gainNode.gain.setValueAtTime(0.4, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          oscillator.start(now);
          oscillator.stop(now + 0.3);
          break;
        case 'double':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(800, now);
          oscillator.frequency.setValueAtTime(800, now + 0.15);
          gainNode.gain.setValueAtTime(0.3, now);
          gainNode.gain.setValueAtTime(0, now + 0.1);
          gainNode.gain.setValueAtTime(0.3, now + 0.15);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          oscillator.start(now);
          oscillator.stop(now + 0.3);
          break;
        case 'low':
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(300, now);
          oscillator.frequency.exponentialRampToValueAtTime(150, now + 0.5);
          gainNode.gain.setValueAtTime(0.6, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          oscillator.start(now);
          oscillator.stop(now + 0.5);
          break;
        case 'laser':
          oscillator.type = 'sawtooth';
          oscillator.frequency.setValueAtTime(2000, now);
          oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.2);
          gainNode.gain.setValueAtTime(0.2, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          oscillator.start(now);
          oscillator.stop(now + 0.2);
          break;
        default:
          // Original sound
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, now);
          oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.15);
          gainNode.gain.setValueAtTime(0.5, now);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
          oscillator.start(now);
          oscillator.stop(now + 0.6);
      }
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const subscribeToPush = async (forceFresh = false) => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }
        await navigator.serviceWorker.ready;

        // Get VAPID public key from server
        let response = await fetch('/api/push/vapid-public-key').catch(() => null);
        if (!response || !response.ok) {
          response = await fetch('/api/vapid-public-key').catch(() => null);
        }
        if (!response || !response.ok) return;
        const text = await response.text();
        
        if (text.includes("Rate exceeded")) return;
        
        let publicKey;
        try {
          const data = JSON.parse(text);
          publicKey = data.publicKey;
        } catch (e) {
          return;
        }
        
        if (!publicKey) return;

        let existingSub = await registration.pushManager.getSubscription().catch(() => null);

        let deviceId = localStorage.getItem('botflow_device_id');
        if (!deviceId) {
          deviceId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
          localStorage.setItem('botflow_device_id', deviceId);
        }

        const activeAccId = localStorage.getItem('currentProfileId') || localStorage.getItem('activeAccountId') || 'default';
        const pushScope = localStorage.getItem('botflow_push_scope') || 'current';

        if (existingSub && !forceFresh) {
          const subJSON = existingSub.toJSON();
          const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-account-id': activeAccId,
              'x-device-id': deviceId,
              'x-push-scope': pushScope
            },
            body: JSON.stringify({ ...subJSON, deviceId, pushScope })
          }).catch(() => null);

          if (res && res.ok) {
            console.log('Existing push subscription confirmed active on server.');
            return;
          }
          await existingSub.unsubscribe().catch(() => {});
        }

        // Convert base64 public key to Uint8Array
        const padding = '='.repeat((4 - publicKey.length % 4) % 4);
        const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray
        });

        // Send subscription to server
        const subscriptionJSON = subscription.toJSON();
        console.log('Sending push subscription to server:', subscriptionJSON);
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-account-id': activeAccId,
            'x-device-id': deviceId,
            'x-push-scope': pushScope
          },
          body: JSON.stringify({ ...subscriptionJSON, deviceId, pushScope })
        });
        
        console.log('Push subscription successful for account:', activeAccId);
      } catch (err: any) {
        console.warn('Push subscription unavailable or restricted:', err?.message || err);
      }
    }
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          showNotification('success', '🔔 Background notifications enabled!');
          playNotificationSound();
          
          if ('serviceWorker' in navigator) {
            await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
          }
          await subscribeToPush();
          
          // Send instant test push
          fetch('/api/push/test', { method: 'POST' }).catch(() => {});
        } else {
          showNotification('error', 'Notification permission denied in browser');
        }
      } catch (e) {
        showNotification('error', 'Failed to request notification permission');
      }
    }
  };

  useEffect(() => {
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  const handleForceUpdateAndPurge = async () => {
    toast.loading('Clearing stale caches & loading latest version...', { id: 'force-update' });
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }
      // Also clear old localStorage caches that could hold stale rule definitions
      const keysToClear = ['botflow_keywords', 'botflow_stats', 'botflow_logs'];
      keysToClear.forEach(k => {
        try {
          localStorage.removeItem(`default_${k}`);
          localStorage.removeItem(k);
        } catch (e) {}
      });
    } catch (e) {
      console.warn('Cache purge error:', e);
    }
    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname + '?live_sync=' + Date.now();
    }, 400);
  };

  useEffect(() => {
    // Register Service Worker for PWA & Background Push Notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(() => {
          console.log('Service Worker active');
          if ('Notification' in window && Notification.permission === 'granted') {
            subscribeToPush();
          }
        })
        .catch(err => {
          console.warn('SW registration warning:', err);
        });
    }

    // Request notification permission on mount if default
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') subscribeToPush();
      }).catch(() => {});
    } else if ("Notification" in window && Notification.permission === "granted") {
      subscribeToPush();
    }

    // Connect to SSE
    console.log("Connecting to SSE notifications...");
    const activeAccId = localStorage.getItem('currentProfileId') || localStorage.getItem('activeAccountId') || 'default';
    const eventSource = new EventSource(`/api/notifications?account_id=${encodeURIComponent(activeAccId)}`);
    
    eventSource.onopen = () => {
      console.log("SSE connection established");
    };

    eventSource.onerror = (err) => {
      // EventSource automatically retries connection on drop/heartbeat idle
      if (eventSource.readyState === EventSource.CLOSED) {
        console.warn("SSE connection closed, retrying...");
      } else {
        console.warn("SSE connection interrupted, retrying...");
      }
    };
    
    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        console.log("Received notification event:", parsed);
        
        if (parsed.type === 'broadcast_update') {
          const data = parsed.data;
          setBroadcastProgress(data);
          if (data.status === 'completed') {
            showNotification('success', 'Broadcast completed successfully!');
            setBroadcasting(false);
          } else if (data.status === 'cancelled') {
            showNotification('warn', 'Broadcast cancelled');
            setBroadcasting(false);
          } else if (data.status === 'error') {
            showNotification('error', 'Broadcast encountered an error');
            setBroadcasting(false);
          }
          return;
        }

        
        if (parsed.type === 'push_broadcast') {
          const { title, message } = parsed.data || {};
          showNotification('success', `📢 ${title || 'Push Alert'}: ${message || ''}`);
          if (notificationSoundEnabled) playNotificationSound();
          fetchAppState();
          return;
        }

        if (parsed.type === 'keyword_hit_notify') {
          const topicName = parsed.data.topicName || 'General';
          const matchedWord = parsed.data.keyword || 'Rule';
          const chatTitle = parsed.data.groupName || 'Group';
          const userMsg = parsed.data.userMessage || '';
          
          const notifyMsg = `Matched "${matchedWord}" in "${topicName}" (${chatTitle})`;
          showNotification('success', notifyMsg);
          if (notificationSoundEnabled) playNotificationSound();

          if ("Notification" in window && Notification.permission === "granted") {
            const shortMessage = userMsg ? `\n"${userMsg.length > 60 ? userMsg.substring(0, 60) + '...' : userMsg}"` : '';
            const options = {
              body: `Keyword: "${matchedWord}"\nGroup: ${chatTitle}${shortMessage}`,
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              silent: false,
              requireInteraction: true,
              tag: `keyword-hit-${Date.now()}`,
              data: {
                url: '/'
              }
            };
            const customTitle = `🎯 ${topicName} - Keyword Hit!`;
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.ready.then(reg => reg.showNotification(customTitle, options)).catch(() => {
                try { new Notification(customTitle, options); } catch(e){}
              });
            } else {
              try { new Notification(customTitle, options); } catch(e){}
            }
          }
          return;
        }
        if (parsed.type === 'photo_received') {
          const message = parsed.data.message;
          
          // Show in-app notification
          showNotification('success', message);
          
          // Play sound if enabled
          if (notificationSoundEnabled) {
            playNotificationSound();
          }
          
          // Show system notification
          if ("Notification" in window && Notification.permission === "granted") {
            const notificationUrl = parsed.data.url || '/';
            console.log("Showing system notification with URL:", notificationUrl);
            
            const options = {
              body: message,
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              silent: false,
              requireInteraction: true,
              tag: `photo-received-${Date.now()}`,
              data: {
                url: notificationUrl
              }
            };

            try {
              // Try Service Worker notification first (required for Android Chrome)
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                  registration.showNotification("UserBot Pro", options);
                }).catch(() => {
                  // Fallback to constructor
                  const n = new Notification("UserBot Pro", options);
                  n.onclick = (e) => {
                    e.preventDefault();
                    window.focus();
                    window.open(notificationUrl, '_blank');
                  };
                });
              } else {
                const n = new Notification("UserBot Pro", options);
                n.onclick = (e) => {
                  e.preventDefault();
                  window.focus();
                  window.open(notificationUrl, '_blank');
                };
              }
            } catch (e) {
              console.error("Notification creation failed", e);
            }
          }
        } else if (parsed.type === 'photo_sent') {
          // Fetch stats to update the photo sent count
          fetchStats();
        } else if (parsed.type === 'topic_blocked') {
          const message = parsed.data.message;
          showNotification('warn', message);
          if (notificationSoundEnabled) {
            playNotificationSound();
          }
          fetchBlockedTopics();
        }
      } catch (e) {
        console.error("SSE Parse Error", e);
      }
    };

    // Fetch initial broadcast status
    fetch("/api/broadcast/status")
      .then(async res => {
        if (!res.ok) return null;
        const text = await res.text();
        if (text.includes("Rate exceeded")) return null;
        try {
          return JSON.parse(text);
        } catch (e) {
          return null;
        }
      })
      .then(data => {
        if (data && data.status === 'running') {
          setBroadcasting(true);
          setBroadcastProgress(data);
        }
      })
      .catch(() => {
        // Silently handle fetch failure during server startup/restarts
      });

    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
    };
  }, [notificationSoundEnabled, notificationSoundType, fetchBlockedTopics, currentProfileId]);

  // Auth State
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [authStep, setAuthStep] = useState<'credentials' | 'phone' | 'code'>('credentials');
  const [authLoading, setAuthLoading] = useState(false);
  const hasLoadedInitialSettingsRef = useRef(false);
  
  const [isHeaderRefreshing, setIsHeaderRefreshing] = useState(false);

  // Consolidated fetcher that retrieves all critical app state in a single, fast API call
  const fetchAppState = async (forceSyncForm = false) => {
    try {
      const res = await apiJson("/api/app-state");
      if (res.ok && res.data && res.data.success) {
        const { stats: sData, keywords: kwData, blockedTopics: btData, missedCount: mcData, logs: lData, lastImportInfo: liData } = res.data;
        if (sData) {
          setStats(sData);
          if (!hasLoadedInitialSettingsRef.current || forceSyncForm) {
            hasLoadedInitialSettingsRef.current = true;
            setTargetGroupId(sData.targetGroupId || "");
            setAutoReplyInput(sData.autoReply || "");
            setAppLogoInput(sData.appLogo || "");
            setAutoReply2Enabled(!!sData.autoReply2Enabled);
            setAutoReply2Input(sData.autoReply2 || "");
            setAutoReply2DelayInput(sData.autoReply2Delay || 1);
            setDelaySecondsInput(sData.delaySeconds || 0);
            setKeywordDelaySecondsInput(sData.keywordDelaySeconds || 0);
            setApiIdInput(sData.apiId || "");
            setApiHashInput(sData.apiHash || "");
            setPhotoReplyEnabled(!!sData.photoReplyEnabled);
            setPhotoReplyMessage(sData.photoReplyMessage || "");
            setPhotoReplyMessage2Enabled(!!sData.photoReplyMessage2Enabled);
            setPhotoReplyMessage2(sData.photoReplyMessage2 || "");
            setPhotoReplyMessage2StartTime(sData.photoReplyMessage2StartTime || "");
            setPhotoReplyMessage2EndTime(sData.photoReplyMessage2EndTime || "");
            setPhotoReplyMax(sData.photoReplyMax || 2);
            setTopicIcon(sData.topicIcon || "✅");
            setTopicRenameEmoji(sData.topicRenameEmoji || "🛑");
            setTopicRenameKeywords(sData.topicRenameKeywords || "");
            setTopicRenameMatchMode(sData.topicRenameMatchMode || "exact");
            setAiModeEnabled(!!sData.aiModeEnabled);
            setAiPersona(sData.aiPersona || "");
            setReplyInGeneral(!!sData.replyInGeneral);
            setTelegramBotToken(sData.telegram_bot_token || "");
            try {
              const parsedKeys = JSON.parse(sData.geminiApiKeys || "[]");
              setGeminiApiKeys(Array.isArray(parsedKeys) ? parsedKeys : []);
            } catch (e) {
              setGeminiApiKeys([]);
            }
            setAutoResetKeywords(sData.autoResetKeywords ?? true);
            try {
              const parsed = JSON.parse(sData.autoBlockKeywords || "[]");
              setAutoBlockKeywords(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
              if (sData.autoBlockKeywords) {
                setAutoBlockKeywords(sData.autoBlockKeywords.split(",").map((k: string) => ({ keyword: k.trim(), matchMode: 'partial' })).filter((k: any) => k.keyword));
              } else {
                setAutoBlockKeywords([]);
              }
            }
            setNotificationSoundEnabled(!!sData.notificationSoundEnabled);
            setNotificationSoundType(sData.notificationSoundType || "default");
            if (!phone) setPhone(sData.defaultPhone || "");
            
            if (sData.apiId && sData.apiHash && sData.apiId !== "0" && sData.apiHash !== "") {
              setAuthStep(prev => prev === 'credentials' ? 'phone' : prev);
            }
          }
        }
        if (Array.isArray(kwData)) setKeywords(kwData);
        if (Array.isArray(btData)) setBlockedTopics(btData);
        if (typeof mcData === 'number') setMissedCount(mcData);
        if (Array.isArray(lData) && lData.length > 0) setLogs(lData);
        if (liData) setLastImportInfo(liData);
      }
    } catch (err: any) {
      console.error("fetchAppState error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    if (isHeaderRefreshing) return;
    setIsHeaderRefreshing(true);
    invalidateApiCache();
    try {
      await fetchAppState(true);
      showNotification('success', 'Data refreshed successfully! ⚡');
    } catch (err) {
      console.error("Refresh failed:", err);
      showNotification('error', 'Failed to refresh data.');
    } finally {
      setIsHeaderRefreshing(false);
    }
  };

  const fetchStats = async (forceSyncForm = false) => {
    try {
      const res = await apiJson("/api/stats");
      if (res.ok && res.data) {
        const data = res.data;
        setStats(data);
        
        if (!hasLoadedInitialSettingsRef.current || forceSyncForm) {
          hasLoadedInitialSettingsRef.current = true;
          setTargetGroupId(data.targetGroupId || "");
          setAutoReplyInput(data.autoReply || "");
          setAppLogoInput(data.appLogo || "");
          setAutoReply2Enabled(!!data.autoReply2Enabled);
          setAutoReply2Input(data.autoReply2 || "");
          setAutoReply2DelayInput(data.autoReply2Delay || 1);
          setDelaySecondsInput(data.delaySeconds || 0);
          setKeywordDelaySecondsInput(data.keywordDelaySeconds || 0);
          setApiIdInput(data.apiId || "");
          setApiHashInput(data.apiHash || "");
          setPhotoReplyEnabled(!!data.photoReplyEnabled);
          setPhotoReplyMessage(data.photoReplyMessage || "");
          setPhotoReplyMessage2Enabled(!!data.photoReplyMessage2Enabled);
          setPhotoReplyMessage2(data.photoReplyMessage2 || "");
          setPhotoReplyMessage2StartTime(data.photoReplyMessage2StartTime || "");
          setPhotoReplyMessage2EndTime(data.photoReplyMessage2EndTime || "");
          setPhotoReplyMax(data.photoReplyMax || 2);
          setTopicIcon(data.topicIcon || "✅");
          setTopicRenameEmoji(data.topicRenameEmoji || "🛑");
          setTopicRenameKeywords(data.topicRenameKeywords || "");
          setTopicRenameMatchMode(data.topicRenameMatchMode || "exact");
          setAiModeEnabled(!!data.aiModeEnabled);
          setAiPersona(data.aiPersona || "");
          setReplyInGeneral(!!data.replyInGeneral);
          setTelegramBotToken(data.telegram_bot_token || "");
          try {
            const parsedKeys = JSON.parse(data.geminiApiKeys || "[]");
            setGeminiApiKeys(Array.isArray(parsedKeys) ? parsedKeys : []);
          } catch (e) {
            setGeminiApiKeys([]);
          }
          setAutoResetKeywords(data.autoResetKeywords ?? true);
          try {
            const parsed = JSON.parse(data.autoBlockKeywords || "[]");
            setAutoBlockKeywords(Array.isArray(parsed) ? parsed : []);
          } catch (e) {
            if (data.autoBlockKeywords) {
              setAutoBlockKeywords(data.autoBlockKeywords.split(",").map((k: string) => ({ keyword: k.trim(), matchMode: 'partial' })).filter((k: any) => k.keyword));
            } else {
              setAutoBlockKeywords([]);
            }
          }
          setNotificationSoundEnabled(!!data.notificationSoundEnabled);
          setNotificationSoundType(data.notificationSoundType || "default");
          if (!phone) setPhone(data.defaultPhone || "");
          
          if (data.apiId && data.apiHash && data.apiId !== "0" && data.apiHash !== "") {
            setAuthStep(prev => prev === 'credentials' ? 'phone' : prev);
          }
        }
      }
    } catch (err: any) {
      if (err.message !== "Failed to fetch") {
        console.error("Failed to fetch stats", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchKeywords = async () => {
    try {
      const res = await apiJson("/api/keywords");
      if (res.ok && Array.isArray(res.data)) {
        setKeywords(res.data);
      }
    } catch (err: any) {
      if (err.message !== "Failed to fetch") {
        console.error("Failed to fetch keywords", err);
      }
    }
  };

  const filteredKeywords = useMemo(() => {
    const searchLower = deferredKeywordSearch.toLowerCase();
    let result = keywords.filter(kw => {
      const kws = (kw.keywords && kw.keywords.length > 0 ? kw.keywords : [kw.keyword]);
      const matchesKeyword = kws.some(k => k?.toLowerCase().includes(searchLower));
      const matchesReply = kw.reply?.toLowerCase().includes(searchLower);
      return matchesKeyword || matchesReply;
    });

    switch (keywordFilter) {
      case 'active': result = result.filter(kw => kw.enabled !== false); break;
      case 'inactive': result = result.filter(kw => kw.enabled === false); break;
      case 'approval': result = result.filter(kw => !!kw.approval_mode); break;
      case 'notify': result = result.filter(kw => !!kw.notify_on_hit); break;
      case 'forward': result = result.filter(kw => kw.message_link || (kw.message_links && kw.message_links.length > 0)); break;
      case 'message': result = result.filter(kw => kw.reply); break;
      case 'highest': result = [...result].sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0)); break;
      case 'lowest': result = [...result].sort((a, b) => (a.keywords?.length || 0) - (b.keywords?.length || 0)); break;
    }

    return result;
  }, [keywords, deferredKeywordSearch, keywordFilter]);

  const displayedKeywords = useMemo(() => {
    return filteredKeywords.slice(0, visibleKeywordsCount);
  }, [filteredKeywords, visibleKeywordsCount]);

  useEffect(() => {
    setVisibleKeywordsCount(50);
  }, [deferredKeywordSearch]);

  const handleKeywordsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (visibleKeywordsCount < filteredKeywords.length) {
        setVisibleKeywordsCount(prev => prev + 50);
      }
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase()) || 
                           (log.details && log.details.toLowerCase().includes(logSearch.toLowerCase()));
      const matchesLevel = logLevelFilter === 'all' || log.level === logLevelFilter;
      const matchesCategory = logCategoryFilter === 'all' || log.category === logCategoryFilter;
      return matchesSearch && matchesLevel && matchesCategory;
    });
  }, [logs, logSearch, logLevelFilter, logCategoryFilter]);

  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleLogsCount);
  }, [filteredLogs, visibleLogsCount]);

  useEffect(() => {
    setVisibleLogsCount(100);
  }, [logSearch, logLevelFilter, logCategoryFilter]);

  const logCategories = useMemo(() => {
    const cats = new Set<string>();
    logs.forEach(l => { if (l.category) cats.add(l.category); });
    return Array.from(cats);
  }, [logs]);

  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (visibleLogsCount < filteredLogs.length) {
        setVisibleLogsCount(prev => prev + 100);
      }
    }
  };

  const fetchLogs = async () => {
    setRefreshingLogs(true);
    try {
      const res = await apiJson("/api/logs");
      if (res.ok && Array.isArray(res.data)) {
        setLogs(res.data);
      }
    } catch (err: any) {
      if (err.message !== "Failed to fetch") {
        console.error("Failed to fetch logs", err);
      }
    } finally {
      setTimeout(() => setRefreshingLogs(false), 500);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await apiJson("/api/analytics");
      if (res.ok && res.data) {
        setAnalyticsData(res.data);
      }
    } catch (err: any) {
      if (err.message !== "Failed to fetch") {
        console.error("Failed to fetch analytics", err);
      }
    }
  };

  const handleTestPersona = async () => {
    if (!testMessage.trim()) return;
    if (geminiApiKeys.length === 0) {
      showNotification('error', 'Please add a Gemini API Key in settings first.');
      return;
    }
    
    setIsTesting(true);
    setTestReply("");
    try {
      const res = await fetch("/api/test-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testMessage,
          persona: aiPersona,
          apiKey: geminiApiKeys[0] // Use first key for testing
        }),
      });
      
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      
      const data = text ? JSON.parse(text) : null;
      if (res.ok && data) {
        setTestReply(data.reply);
      } else {
        showNotification('error', data?.error || 'Test failed');
      }
    } catch (err) {
      showNotification('error', 'Connection error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    setIsGeneratingSuggestions(true);
    setAiSuggestionsError("");
    try {
      const res = await fetch("/api/gemini/suggest-keywords");
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate suggestions");
      }
      const data = await res.json();
      setAiSuggestions(data.suggestions || []);
      showNotification('success', 'AI Keyword Suggestions generated successfully!');
    } catch (err: any) {
      console.error(err);
      setAiSuggestionsError(err.message || "Something went wrong.");
      showNotification('error', err.message || 'Failed to generate suggestions');
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const handleAddSuggestedKeyword = async (suggestion: any) => {
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: suggestion.keyword,
          keywords: suggestion.keywords,
          reply: suggestion.reply,
          match_mode: "partial",
          enabled: true
        })
      });
      if (res.ok) {
        setAddedSuggestions(prev => [...prev, suggestion.keyword]);
        showNotification('success', `Added rule "${suggestion.keyword}" successfully!`);
        fetchKeywords();
      } else {
        const errData = await res.json();
        showNotification('error', errData.error || "Failed to add keyword");
      }
    } catch (err: any) {
      showNotification('error', err.message || "Failed to add keyword");
    }
  };

  const clearLogs = async () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      return;
    }
    try {
      const res = await fetch("/api/logs", { method: "DELETE" });
      if (res.ok) {
        setLogs([]);
        showNotification('success', 'Logs cleared');
        setIsConfirmingClear(false);
      }
    } catch (err) {
      showNotification('error', 'Failed to clear logs');
      setIsConfirmingClear(false);
    }
  };

  const handleDownloadLogs = async (format: 'json' | 'csv') => {
    try {
      const res = await fetch(`/api/logs/export?format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      showNotification('error', 'Failed to download logs');
    }
  };

  const fetchMissedCount = async () => {
    try {
      const res = await apiJson("/api/missed-count");
      if (res.ok && res.data && typeof res.data.count === 'number') {
        setMissedCount(res.data.count);
      }
    } catch (e: any) {
      if (e.message !== "Failed to fetch") {
        console.error("Failed to fetch missed count", e);
      }
    }
  };

  const fetchMissedList = async () => {
    setIsFetchingMissed(true);
    try {
      const res = await apiJson("/api/missed-list");
      if (res.ok && Array.isArray(res.data)) {
        setMissedList(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch missed list", err);
    } finally {
      setIsFetchingMissed(false);
    }
  };

  const handleSkipMissed = async (id: string) => {
    try {
      const res = await fetch("/api/missed-skip", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setMissedList(prev => prev.filter(item => item._id !== id));
        setMissedCount(prev => Math.max(0, prev - 1));
        showNotification('success', 'Item skipped');
      }
    } catch (err) {
      showNotification('error', 'Failed to skip item');
    }
  };

  const handleSkipAllMissed = async () => {
    if (!confirm("Are you sure you want to skip all missed items?")) return;
    try {
      const res = await fetch("/api/missed-skip-all", { method: 'POST' });
      if (res.ok) {
        setMissedList([]);
        setMissedCount(0);
        showNotification('success', 'All items skipped');
      }
    } catch (err) {
      showNotification('error', 'Failed to skip all items');
    }
  };

  const handleCatchUp = async (triggerIds?: string[] | any) => {
    if (isCatchingUp) return;
    setIsCatchingUp(true);
    
    // Ensure triggerIds is an array of strings, or empty (it might be a React event if called from onClick)
    const ids = Array.isArray(triggerIds) ? triggerIds : [];
    
    try {
      const res = await fetch("/api/catchup", { 
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ triggerIds: ids })
      });
      
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      
      const data = text ? JSON.parse(text) : null;
      if (data && data.success) {
        if (data.cancelled) {
          showNotification('warn', `Catch up cancelled. Processed ${data.count} keywords.`);
        } else {
          showNotification('success', `Caught up with ${data.count} missed keywords`);
        }
        setShowScanModal(false);
        fetchMissedCount();
        fetchStats();
      } else {
        showNotification('error', data?.error || 'Catch up failed');
      }
    } catch (e) {
      showNotification('error', 'Failed to catch up');
    } finally {
      setIsCatchingUp(false);
    }
  };

  const handleCancelCatchUp = async () => {
    try {
      await fetch("/api/cancel-catchup", { method: "POST" });
      showNotification('warn', 'Cancelling catch up...');
    } catch (e) {
      console.error("Failed to cancel catch up", e);
    }
  };

  const handleClearAllMissed = async () => {
    try {
      const res = await fetch("/api/missed-triggers", { method: "DELETE" });
      if (res.ok) {
        setScannedItems([]);
        setMissedCount(0);
        showNotification('success', 'All missed triggers cleared');
      } else {
        showNotification('error', 'Failed to clear missed triggers');
      }
    } catch (err) {
      showNotification('error', 'Failed to clear missed triggers');
    }
  };

  const handleReplyToSingleMissed = async (triggerId: string) => {
    if (replyingIds.has(triggerId)) return;
    
    setReplyingIds(prev => new Set(prev).add(triggerId));
    try {
      const res = await fetch("/api/reply-single-missed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerId })
      });
      
      const text = await res.text();
      let data: any = {};
      if (text.includes("Rate exceeded")) {
        data = { success: false, error: "Rate limit exceeded. Please try again later." };
      } else {
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = { success: false, error: "Invalid response from server" };
        }
      }
      
      if (data.success) {
        showNotification('success', 'Reply sent successfully');
        setScannedItems(prev => prev.filter(item => item._id !== triggerId));
        setMissedCount(prev => Math.max(0, prev - 1));
        fetchStats();
      } else {
        showNotification('error', data.error || 'Failed to send reply');
      }
    } catch (err) {
      showNotification('error', 'Failed to send reply');
    } finally {
      setReplyingIds(prev => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
    }
  };

  const handleScanMissed = async () => {
    if (isScanningMissed) return;
    if (stats?.isSystemPaused) {
      showNotification('error', 'System is paused. Cannot scan for missed items.');
      return;
    }
    setIsScanningMissed(true);
    try {
      const res = await fetch("/api/scan-missed", { method: "POST" });
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      
      const data = text ? JSON.parse(text) : null;
      if (data && data.success) {
        setScannedItems(data.items || []);
        setSelectedScannedItems(new Set((data.items || []).map((i: any) => i._id)));
        setShowScanModal(true);
        fetchMissedCount();
        fetchStats();
        if (activeTab === 'catchup') {
          fetchMissedList();
        }
        if (data.count > 0) {
          showNotification('success', `Found ${data.count} new missed keywords`);
        } else {
          showNotification('success', 'No new missed keywords found');
        }
      } else {
        showNotification('error', data?.error || 'Scan failed');
      }
    } catch (e) {
      showNotification('error', 'Failed to scan missed topics');
    } finally {
      setIsScanningMissed(false);
    }
  };

  useEffect(() => {
    fetchAppState();
    fetchAnalytics();
    fetchImportBatches();
    pingDeviceSession(currentProfileId);

    const handleAccountChangeEvent = (e: any) => {
      console.log("Smooth Account Change Event received:", e.detail);
      invalidateApiCache();
      fetchAppState(true);
      fetchAnalytics();
      fetchImportBatches();
      pingDeviceSession(e.detail?.id || currentProfileId);
    };

    window.addEventListener('account_changed', handleAccountChangeEvent);

    // Consolidated background sync every 25 seconds, only when tab is visible
    const globalInterval = setInterval(() => {
      if (!document.hidden) {
        fetchAppState();
        pingDeviceSession(currentProfileId);
      }
    }, 25000);

    return () => {
      window.removeEventListener('account_changed', handleAccountChangeEvent);
      clearInterval(globalInterval);
    };
  }, [currentProfileId]);

  useEffect(() => {
    if (isNotificationOpen) {
      setUnreadCount(0);
      setLastSeenLogCount(logs.length);
    } else {
      const diff = Math.max(0, logs.length - lastSeenLogCount);
      setUnreadCount(diff);
    }
  }, [logs.length, isNotificationOpen, lastSeenLogCount]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    } else if (activeTab === 'analytics') {
      fetchAnalytics();
    } else if (activeTab === 'catchup') {
      fetchMissedList();
    }

    // Refresh active tab data every 25 seconds when visible
    const tabInterval = setInterval(() => {
      if (document.hidden) return;
      if (activeTab === 'dashboard' || activeTab === 'logs') {
        fetchLogs();
      } else if (activeTab === 'analytics') {
        fetchAnalytics();
      } else if (activeTab === 'catchup') {
        fetchMissedList();
      }
    }, 25000);

    return () => clearInterval(tabInterval);
  }, [activeTab]);

  const handleTogglePause = () => {
    setShowPauseConfirmation(true);
  };

  const confirmTogglePause = async () => {
    if (!stats) return;
    const newPausedState = !stats?.isSystemPaused;
    setShowPauseConfirmation(false);
    
    // Optimistic update
    setStats({ ...stats, isSystemPaused: newPausedState });
    
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPaused: newPausedState }),
      });
      
      if (res.ok) {
        showNotification('success', newPausedState ? 'System Paused' : 'System Resumed');
        fetchStats();
      } else {
        // Revert on failure
        setStats({ ...stats, isSystemPaused: !newPausedState });
        showNotification('error', 'Failed to update status');
      }
    } catch (err) {
      setStats({ ...stats, isSystemPaused: !newPausedState });
      showNotification('error', 'Connection error');
    }
  };

  const testPush = async () => {
    try {
      showNotification('success', 'Refreshing push subscription...');
      await subscribeToPush(true).catch(() => {});
      const response = await fetch('/api/push/test', { method: 'POST' });
      if (response.ok) {
        showNotification('success', '🔔 Test push sent! Close the app or lock phone to verify background delivery.');
      } else {
        showNotification('error', 'Failed to send test push.');
      }
    } catch (err) {
      showNotification('error', 'Error sending test push.');
    }
  };

  const handleToggleAutoReset = async () => {
    const newState = !autoResetKeywords;
    setAutoResetKeywords(newState);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoResetKeywords: newState }),
      });
      if (res.ok) {
        showNotification('success', newState ? 'Auto Reset Enabled' : 'Auto Reset Disabled');
        fetchStats();
      } else {
        setAutoResetKeywords(!newState);
        showNotification('error', 'Failed to update setting');
      }
    } catch (err) {
      setAutoResetKeywords(!newState);
      showNotification('error', 'Failed to update setting');
    }
  };

  const handleToggleReplyInGeneral = async () => {
    const newState = !replyInGeneral;
    setReplyInGeneral(newState);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyInGeneral: newState }),
      });
      if (res.ok) {
        showNotification('success', newState ? 'Reply in General Enabled' : 'Reply in General Disabled');
        fetchStats();
      } else {
        setReplyInGeneral(!newState);
        showNotification('error', 'Failed to update setting');
      }
    } catch (err) {
      setReplyInGeneral(!newState);
      showNotification('error', 'Failed to update setting');
    }
  };

  const handleToggleAiMode = async () => {
    const newState = !aiModeEnabled;
    setAiModeEnabled(newState);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiModeEnabled: newState }),
      });
      if (res.ok) {
        showNotification('success', newState ? 'AI Smart Reply Enabled' : 'AI Smart Reply Disabled');
        fetchStats();
      } else {
        setAiModeEnabled(!newState);
        showNotification('error', 'Failed to update setting');
      }
    } catch (err) {
      setAiModeEnabled(!newState);
      showNotification('error', 'Failed to update setting');
    }
  };

  const handleTogglePhotoReply = async () => {
    const newState = !photoReplyEnabled;
    setPhotoReplyEnabled(newState);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoReplyEnabled: newState }),
      });
      if (res.ok) {
        showNotification('success', newState ? 'Photo Reply Enabled' : 'Photo Reply Disabled');
        fetchStats();
      } else {
        setPhotoReplyEnabled(!newState);
        showNotification('error', 'Failed to update setting');
      }
    } catch (err) {
      setPhotoReplyEnabled(!newState);
      showNotification('error', 'Failed to update setting');
    }
  };

  const handleTogglePhotoReplyMessage2 = async () => {
    const newState = !photoReplyMessage2Enabled;
    setPhotoReplyMessage2Enabled(newState);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoReplyMessage2Enabled: newState }),
      });
      if (res.ok) {
        showNotification('success', newState ? 'Second Photo Reply Enabled' : 'Second Photo Reply Disabled');
        fetchStats();
      } else {
        setPhotoReplyMessage2Enabled(!newState);
        showNotification('error', 'Failed to update setting');
      }
    } catch (err) {
      setPhotoReplyMessage2Enabled(!newState);
      showNotification('error', 'Failed to update setting');
    }
  };

  const handleToggleNotificationSound = async () => {
    const newState = !notificationSoundEnabled;
    setNotificationSoundEnabled(newState);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationSoundEnabled: newState }),
      });
      if (res.ok) {
        showNotification('success', newState ? 'Notification Sound Enabled' : 'Notification Sound Disabled');
        fetchStats();
      } else {
        setNotificationSoundEnabled(!newState);
        showNotification('error', 'Failed to update setting');
      }
    } catch (err) {
      setNotificationSoundEnabled(!newState);
      showNotification('error', 'Failed to update setting');
    }
  };

  const handleUpdateNotificationSoundType = async (type: string) => {
    setNotificationSoundType(type);
    playNotificationSound(type);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationSoundType: type }),
      });
      if (res.ok) {
        showNotification('success', `Sound type set to ${type}`);
        fetchStats();
      } else {
        showNotification('error', 'Failed to update sound type');
      }
    } catch (err) {
      showNotification('error', 'Failed to update sound type');
    }
  };

  const handleUpdateAutoBlockKeywords = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoBlockKeywords: JSON.stringify(autoBlockKeywords) }),
      });
      if (res.ok) {
        showNotification('success', 'Auto-block keywords updated');
        fetchStats();
      } else {
        showNotification('error', 'Failed to update keywords');
      }
    } catch (err) {
      showNotification('error', 'Connection error');
    } finally {
      setSaving(false);
    }
  };

  const addAutoBlockKeyword = () => {
    setAutoBlockKeywords([{ keyword: "", matchMode: 'partial' }, ...autoBlockKeywords]);
  };

  const removeAutoBlockKeyword = (index: number) => {
    const newList = [...autoBlockKeywords];
    newList.splice(index, 1);
    setAutoBlockKeywords(newList);
  };

  const updateAutoBlockKeyword = (index: number, field: keyof AutoBlockKeyword, value: string) => {
    const newList = [...autoBlockKeywords];
    newList[index] = { ...newList[index], [field]: value };
    setAutoBlockKeywords(newList);
  };

  const handleUpdateSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          autoReply: autoReplyInput,
          appLogo: appLogoInput,
          autoReply2Enabled,
          autoReply2: autoReply2Input,
          autoReply2Delay: autoReply2DelayInput,
          delaySeconds: delaySecondsInput,
          keywordDelaySeconds: keywordDelaySecondsInput,
          apiId: apiIdInput,
          apiHash: apiHashInput,
          photoReplyEnabled,
          photoReplyMessage,
          photoReplyMessage2Enabled,
          photoReplyMessage2,
          photoReplyMessage2StartTime,
          photoReplyMessage2EndTime,
          photoReplyMax: Number(photoReplyMax) || 2,
          notificationSoundEnabled,
          notificationSoundType,
          topicIcon,
          topicRenameEmoji,
          topicRenameKeywords,
          topicRenameMatchMode,
          targetGroupId,
          aiModeEnabled,
          aiPersona,
          geminiApiKeys: JSON.stringify(geminiApiKeys),
          telegramBotToken
        }),
      });
      
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      
      const data = text ? JSON.parse(text) : null;
      
      if (res.ok) {
        showNotification('success', 'Settings updated!');
        fetchStats(true);
      } else {
        showNotification('error', data?.error || `Update failed: ${res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Connection error: Check console for details');
    } finally {
      setSaving(false);
    }
  };

  const handleAddKeyword = async (data: any) => {
    const validKeywords = data.keywords.filter((k: string) => k.trim().length > 0);
    if (validKeywords.length === 0) {
      showNotification('error', "Please enter at least one keyword");
      return;
    }
    
    const hasMessageLinks = data.message_links && data.message_links.filter((l: string) => l.trim().length > 0).length > 0;
    
    if (!data.reply.trim() && !data.ai_reply_enabled && !hasMessageLinks) {
      showNotification('error', "Please enter a reply message, a message link, or enable AI reply");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: editingKeywordId,
        keyword: validKeywords[0], // Legacy support
        keywords: validKeywords,
        reply: data.reply,
        match_mode: data.match_mode,
        message_links: data.message_links ? data.message_links.filter((l: string) => l.trim().length > 0) : [],
        max_replies: parseInt(data.max_replies.toString()) || 0,
        ai_reply_enabled: !!data.ai_reply_enabled,
        approval_mode: !!data.approval_mode,
        notify_on_hit: !!data.notify_on_hit,
        target_groups: data.target_groups || []
      };

      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        showNotification('success', editingKeywordId ? 'Rule updated!' : 'Rule created!');
        setEditingKeywordId(null);
        fetchKeywords();
      } else {
        const text = await res.text();
        let errData: any = {};
        if (text.includes("Rate exceeded")) {
          errData = { error: "Rate limit exceeded. Please try again later." };
        } else {
          try {
            errData = JSON.parse(text);
          } catch (e) {
            errData = { error: "Invalid response from server" };
          }
        }
        showNotification('error', errData?.error || 'Failed to save rule');
      }
    } catch (error) {
      showNotification('error', "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const verifyKey = async (key: string) => {
    if (!key) return;
    showNotification('warn', 'Verifying key...');
    try {
      const res = await fetch("/api/verify-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      
      const data = text ? JSON.parse(text) : null;
      
      if (data && data.success) {
        showNotification('success', 'API Key is valid and connected!');
      } else {
        showNotification('error', `Invalid Key: ${data.error}`);
      }
    } catch (err) {
      showNotification('error', 'Verification failed: Network error');
    }
  };

  const handleDuplicateKeyword = async (kw: Keyword) => {
    const validKeywords = kw.keywords && kw.keywords.length > 0 ? kw.keywords : (kw.keyword ? [kw.keyword] : []);
    if (validKeywords.length === 0) {
      showNotification('error', "Cannot copy empty keyword rule");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        keyword: validKeywords[0],
        keywords: validKeywords,
        reply: kw.reply || "",
        photo: kw.photo || "",
        match_mode: kw.match_mode || 'exact',
        message_link: kw.message_link || "",
        message_links: kw.message_links || [],
        max_replies: typeof kw.max_replies === 'number' ? kw.max_replies : 0,
        ai_reply_enabled: !!kw.ai_reply_enabled,
        approval_mode: !!kw.approval_mode,
        notify_on_hit: !!kw.notify_on_hit,
        target_groups: kw.target_groups || []
      };

      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showNotification('success', 'Keyword rule copied! Duplicate added.');
        fetchKeywords();
      } else {
        const newKeywordObj: Keyword = {
          ...kw,
          _id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 6)
        };
        setKeywords(prev => [newKeywordObj, ...prev]);
        showNotification('success', 'Keyword rule copied!');
      }
    } catch (error) {
      const newKeywordObj: Keyword = {
        ...kw,
        _id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 6)
      };
      setKeywords(prev => [newKeywordObj, ...prev]);
      showNotification('success', 'Keyword rule copied!');
    } finally {
      setSaving(false);
    }
  };

  const handleEditKeyword = (kw: Keyword) => {
    setEditingKeywordId(kw._id);
    keywordsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelEdit = () => {
    setEditingKeywordId(null);
  };

  const handleDeleteKeyword = (id: string) => {
    setDeleteConfirmationId(id);
  };

  const handleToggleKeyword = async (id: string, enabled: boolean) => {
    // Optimistic state update
    setKeywords(prev => prev.map(k => k._id === id ? { ...k, enabled } : k));
    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        showNotification('success', `Keyword ${enabled ? 'enabled' : 'disabled'}`);
        fetchKeywords();
      } else {
        showNotification('error', 'Failed to update keyword');
        fetchKeywords();
      }
    } catch (err) {
      showNotification('error', 'Update failed');
      fetchKeywords();
    }
  };

  
  const handleToggleNotifyOnHit = async (id: string, notify_on_hit: boolean) => {
    // Optimistic state update
    setKeywords(prev => prev.map(k => k._id === id ? { ...k, notify_on_hit } : k));
    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_on_hit }),
      });
      if (res.ok) {
        showNotification('success', `Notifications ${notify_on_hit ? 'enabled' : 'disabled'}`);
        fetchKeywords();
      } else {
        showNotification('error', 'Failed to update notification setting');
        fetchKeywords();
      }
    } catch (err) {
      showNotification('error', 'Update failed');
      fetchKeywords();
    }
  };

  const handleToggleApprovalMode = async (id: string, approval_mode: boolean) => {
    // Optimistic state update
    setKeywords(prev => prev.map(k => k._id === id ? { ...k, approval_mode } : k));
    try {
      const res = await fetch(`/api/keywords/${id}/approval`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_mode }),
      });
      if (res.ok) {
        showNotification('success', `Approval mode ${approval_mode ? 'enabled' : 'disabled'}`);
        fetchKeywords();
      } else {
        showNotification('error', 'Failed to update approval mode');
        fetchKeywords();
      }
    } catch (err) {
      showNotification('error', 'Update failed');
      fetchKeywords();
    }
  };

  const confirmDeleteKeyword = async () => {
    if (!deleteConfirmationId) return;
    try {
      const res = await fetch(`/api/keywords/${deleteConfirmationId}`, { method: "DELETE" });
      if (res.ok) {
        showNotification('success', 'Keyword deleted');
        fetchKeywords();
      }
    } catch (err) {
      showNotification('error', 'Delete failed');
    } finally {
      setDeleteConfirmationId(null);
    }
  };

  const handleSendCode = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      
      const data = text ? JSON.parse(text) : null;

      if (res.ok) {
        setAuthStep('code');
        showNotification('success', 'Code sent!');
      } else {
        showNotification('error', data?.error || `Failed to send code: ${res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Connection error: Check console');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      
      const data = text ? JSON.parse(text) : null;

      if (res.ok) {
        showNotification('success', 'Connected!');
        fetchStats();
        setAuthStep('credentials');
        setCode("");
        setPassword("");
      } else {
        showNotification('error', data?.error || `Sign in failed: ${res.statusText}`);
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Connection error: Check console');
    } finally {
      setAuthLoading(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportData = async () => {
    try {
      const res = await fetch("/api/data/export");
      const text = await res.text();
      if (text.includes("Rate exceeded")) {
        showNotification('error', 'Rate limit exceeded. Please try again later.');
        return;
      }
      if (res.ok) {
        const data = JSON.parse(text);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `userbot_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('success', 'Data exported successfully');
      }
    } catch (err) {
      showNotification('error', 'Export failed');
    }
  };

  const handleResetKeywords = async () => {
    try {
      const response = await fetch("/api/keywords/reset-all", { method: "POST" });
      if (response.ok) {
        setShowResetKeywordsConfirm(false);
        // Refresh keywords to show updated counts
        const kwRes = await fetch("/api/keywords");
        const kwText = await kwRes.text();
        if (kwText.includes("Rate exceeded")) return;
        try {
          const kwData = JSON.parse(kwText);
          setKeywords(kwData);
          showNotification('success', 'All keywords reset!');
        } catch (e) {
          console.error("Failed to parse keywords after reset", e);
        }
      }
    } catch (error) {
      console.error("Failed to reset keywords:", error);
      showNotification('error', 'Failed to reset keywords');
    }
  };

  const fetchLastImportInfo = async () => {
    try {
      const res = await apiJson("/api/data/last-import-info");
      if (res.ok && res.data) {
        setLastImportInfo(res.data);
      }
    } catch (e) {
      console.error("Failed to fetch last import info:", e);
    }
  };

  const fetchImportBatches = async () => {
    setIsFetchingBatches(true);
    try {
      const res = await apiJson("/api/data/import-batches");
      if (res.ok && Array.isArray(res.data)) {
        setImportBatches(res.data);
      }
    } catch (e) {
      console.error("Failed to fetch import batches:", e);
    } finally {
      setIsFetchingBatches(false);
    }
  };

  const handleDeleteImportBatch = async (batchId: string) => {
    setDeletingBatchId(batchId);
    try {
      const res = await apiFetch(`/api/data/import-batch/${batchId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setBatchToDelete(null);
        showNotification('success', data?.message || 'Imported batch deleted successfully!');
        invalidateApiCache();
        fetchAppState(true);
        fetchImportBatches();
      } else {
        showNotification('error', data?.error || 'Failed to delete imported file');
      }
    } catch (err) {
      console.error("Failed to delete imported batch:", err);
      showNotification('error', 'Error deleting imported file');
    } finally {
      setDeletingBatchId(null);
    }
  };

  const handleAccountSwitch = async (profile: { id: string; name: string }) => {
    showNotification('success', `Switched to ${profile.name}`);
    setCurrentProfileId(profile.id);
    invalidateApiCache();
    try {
      await Promise.all([
        fetchAppState(true),
        fetchAnalytics(),
        fetchImportBatches()
      ]);
    } catch (e) {
      console.error("Failed to refresh on account switch:", e);
    }
  };

  const handleDeleteLastImport = async () => {
    setDeletingLastImport(true);
    try {
      const res = await fetch("/api/data/last-import", { method: "DELETE" });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch(e) {}

      if (res.ok) {
        setShowDeleteLastKeywordConfirm(false);
        showNotification('success', data?.message || 'Last imported data deleted successfully!');
        fetchKeywords();
        fetchStats();
        fetchLastImportInfo();
      } else {
        showNotification('error', data?.error || 'Failed to delete last imported data');
      }
    } catch (err) {
      console.error("Failed to delete last import:", err);
      showNotification('error', 'Error deleting last import');
    } finally {
      setDeletingLastImport(false);
    }
  };

  const handleDeleteLastRule = async () => {
    setDeletingLastRule(true);
    try {
      const res = await fetch("/api/data/last-rule", { method: "DELETE" });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch(e) {}

      if (res.ok) {
        setShowDeleteLastRuleConfirm(false);
        showNotification('success', data?.message || 'Last rule deleted successfully!');
        fetchKeywords();
        fetchStats();
        fetchLastImportInfo();
      } else {
        showNotification('error', data?.error || 'Failed to delete last rule');
      }
    } catch (err) {
      console.error("Failed to delete last rule:", err);
      showNotification('error', 'Error deleting last rule');
    } finally {
      setDeletingLastRule(false);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        const fileName = file.name || 'imported_rules.json';
        const res = await fetch("/api/data/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, fileName }),
        });

        if (res.ok) {
          const resData = await res.json();
          showNotification('success', `Data imported successfully (${resData?.count || 'all'} rules)`);
          fetchKeywords();
          fetchStats();
          fetchLastImportInfo();
          fetchImportBatches();
        } else {
          showNotification('error', 'Import failed');
        }
      } catch (err) {
        showNotification('error', 'Invalid backup file');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        showNotification('success', 'Logged out');
        fetchStats();
        window.location.reload();
      }
    } catch (err) {
      showNotification('error', 'Logout failed');
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    setBroadcasting(true);
    setBroadcastProgress({ total: 0, current: 0, status: 'running' });
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: broadcastMessage,
          target: broadcastTarget
        }),
      });
      if (res.ok) {
        showNotification('success', 'Broadcast started');
        setBroadcastMessage("");
      } else {
        const text = await res.text();
        let data: any = {};
        if (text.includes("Rate exceeded")) {
          data = { error: "Rate limit exceeded. Please try again later." };
        } else {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = { error: "Invalid response from server" };
          }
        }
        showNotification('error', data.error || 'Broadcast failed');
        setBroadcasting(false);
      }
    } catch (err) {
      showNotification('error', 'Connection error');
      setBroadcasting(false);
    }
  };

  const handleCancelBroadcast = async () => {
    try {
      const res = await fetch("/api/broadcast/cancel", { method: "POST" });
      if (res.ok) {
        showNotification('warn', 'Cancelling broadcast...');
      } else {
        const text = await res.text();
        let data: any = {};
        if (text.includes("Rate exceeded")) {
          data = { error: "Rate limit exceeded. Please try again later." };
        } else {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = { error: "Invalid response from server" };
          }
        }
        showNotification('error', data.error || 'Failed to cancel');
      }
    } catch (err) {
      showNotification('error', 'Connection error');
    }
  };

  // Swift simultaneous sliding page transition animation
  const slideVariants = {
    initial: (dir: number) => ({
      x: (dir || 1) > 0 ? '100%' : '-100%',
      opacity: 0,
      zIndex: 10,
    }),
    animate: {
      x: 0,
      opacity: 1,
      zIndex: 10,
      transition: { 
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }
    },
    exit: (dir: number) => ({
      x: (dir || 1) > 0 ? '-30%' : '30%',
      opacity: 0,
      zIndex: 0,
      transition: { 
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }
    })
  };


  return (
    <AnimatePresence mode="wait">
      {isInitialLoading ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(12px)" }}
          className="fixed inset-0 z-[1000] bg-[#07090e] flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Cyberpunk Grid / Ambient Light */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] rounded-full blur-[140px] opacity-15 bg-blue-600" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%] h-[50%] rounded-full blur-[120px] opacity-15 bg-emerald-600" />
            <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03]" />
          </div>

          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 22, stiffness: 120 }}
            className="relative z-10 flex flex-col items-center"
          >
            {/* Multi-Ring Orbital Loader */}
            <div className="relative w-32 h-32 mb-10 flex items-center justify-center">
              {/* Outer Rotating Dashed Ring */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
                className="absolute inset-0 rounded-full border border-dashed border-emerald-500/30"
              />
              {/* Middle Counter-Rotating Glowing Ring */}
              <motion.div 
                animate={{ rotate: -360 }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                className="absolute -inset-3 rounded-full border-2 border-transparent border-t-blue-500 border-b-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              />
              {/* Inner Pulsing Ring */}
              <motion.div 
                animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.7, 0.3] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                className="absolute -inset-6 rounded-full bg-gradient-to-r from-blue-500/10 to-emerald-500/10 blur-md"
              />

              {/* Central Logo Container */}
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center border border-white/20 bg-neutral-900/90 shadow-2xl backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 animate-pulse" />
                <img src={stats?.appLogo || "/logo.jpg"} alt="Logo" className="w-12 h-12 object-contain rounded-xl relative z-10" />
              </div>
            </div>

            {/* Typography & Pulse Status */}
            <div className="flex flex-col items-center space-y-3">
              <div className="flex items-center space-x-2.5">
                <h1 className="text-3xl font-black tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-emerald-200">
                  BotFlow
                </h1>
                <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[10px] font-black text-emerald-400 tracking-wider uppercase">v3.7</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 bg-white/[0.03] px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="text-[11px] font-medium text-white/70 tracking-wide">Syncing Neural Workspace</span>
                <div className="flex space-x-1 pl-1">
                  <motion.div 
                    animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400" 
                  />
                  <motion.div 
                    animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-blue-400" 
                  />
                  <motion.div 
                    animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400" 
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Bottom Progress Bar */}
          <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center space-y-2">
            <p className="text-[10px] font-semibold text-white/40 tracking-[0.2em] uppercase">Secure Cloud Connection Active</p>
            <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                className="w-3/4 h-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(16,185,129,0.8)]"
              />
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div 
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className={`min-h-screen transition-colors duration-500 ${activeTab === 'logs' || darkMode ? 'bg-black text-white' : 'bg-slate-50 text-slate-800'} font-sans ${activeTab === 'logs' ? 'pb-0' : 'pb-24'} relative overflow-x-hidden`}
        >
      {/* Background Decorative Elements */}
      <div className={`fixed inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-500 ${activeTab === 'logs' ? 'opacity-0' : 'opacity-100'}`}>
        <div className={`absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20 ${darkMode ? 'bg-emerald-500' : 'bg-emerald-300'}`} />
        <div className={`absolute top-[20%] -right-[10%] w-[35%] h-[35%] rounded-full blur-[120px] opacity-20 ${darkMode ? 'bg-blue-500' : 'bg-blue-300'}`} />
        <div className={`absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full blur-[120px] opacity-20 ${darkMode ? 'bg-amber-500' : 'bg-amber-300'}`} />
      </div>

      {/* Header */}
      <header className={`px-2 sm:px-6 py-2 flex items-center justify-between fixed top-0 left-0 right-0 z-50 border-b transition-all duration-500 bg-black border-white/10 text-white shadow-2xl ${activeTab === 'logs' ? 'opacity-0 pointer-events-none -translate-y-full' : 'opacity-100 translate-y-0'}`}>
        
        {/* Oval glow effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[200%] rounded-[100%] blur-3xl opacity-20 bg-white" />
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-3 relative z-10 shrink-0">
          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1.5 sm:p-2 rounded-xl transition relative group text-blue-400 hover:text-white hover:bg-white/10"
            >
              <div className="relative z-10 flex items-center justify-center w-[20px] h-[20px] sm:w-[22px] sm:h-[22px]">
                <div className="flex flex-col items-start justify-center w-full h-full space-y-1 sm:space-y-1.5 transition duration-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.6)] group-hover:drop-shadow-[0_0_12px_rgba(255,255,255,1)]">
                  <span className={`h-0.5 rounded-full transition duration-300 ${isMenuOpen ? 'w-[20px] sm:w-[22px] translate-y-2 rotate-45 bg-white' : 'w-[20px] sm:w-[22px] bg-white'}`}></span>
                  <span className={`h-0.5 rounded-full transition duration-300 ${isMenuOpen ? 'w-0 opacity-0 bg-white' : 'w-[14px] sm:w-[16px] bg-white'}`}></span>
                  <span className={`h-0.5 rounded-full transition duration-300 ${isMenuOpen ? 'w-[20px] sm:w-[22px] -translate-y-2 -rotate-45 bg-white' : 'w-[9px] sm:w-[10px] bg-white'}`}></span>
                </div>
                {isMenuOpen && (
                  <motion.div 
                    layoutId="menu-glow"
                    className="absolute inset-0 bg-white/20 blur-xl rounded-full -z-10"
                  />
                )}
              </div>
              <div className="absolute inset-0 bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
            {/* Status dot overlapping the 3-line bar */}
            <div className={`absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border-2 border-black z-20 ${stats?.isUserBotConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}>
               <div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${stats?.isUserBotConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-3">
            <div 
              onClick={() => setIsLogoModalOpen(true)}
              className="relative w-7 h-7 sm:w-8 sm:h-8 group cursor-pointer shrink-0" 
              title="Click to choose or upload app logo"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500 to-blue-500 rounded-lg rotate-3 opacity-40 group-hover:rotate-6 transition-transform duration-500"></div>
              <div className="relative w-full h-full rounded-lg overflow-hidden flex items-center justify-center border transition-colors duration-500 bg-neutral-900 border-white/10 group-hover:border-emerald-500/50">
                <img src={appLogoInput || stats?.appLogo || "/pwa-192x192.png"} alt="Logo" className="w-4 h-4 sm:w-5 sm:h-5 object-contain rounded-md" />
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-1">
                <h1 className="font-black text-sm sm:text-xl tracking-tighter leading-none transition-colors duration-500 text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-emerald-100">
                  BotFlow
                </h1>
                <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400 animate-pulse" />
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[6.5px] sm:text-[7px] font-black text-emerald-400 tracking-[0.25em] uppercase block">v3.7 • Premium AI</span>
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Side Controls: Account Switcher & Notifications */}
        <div className="flex items-center space-x-1 sm:space-x-2 relative z-10 shrink-0">
          <ProfileSelector isConnected={stats?.isUserBotConnected} onSwitchAccount={handleAccountSwitch} />

          {/* Quick manual refresh button */}
          <button 
            onClick={handleManualRefresh}
            disabled={isHeaderRefreshing}
            className={`p-1 sm:p-2 rounded-lg sm:rounded-xl transition relative group text-emerald-400 hover:text-white hover:bg-white/10 shrink-0 ${isHeaderRefreshing ? 'cursor-not-allowed opacity-65' : ''}`}
            title="Refresh App Data"
          >
            <motion.div
              animate={isHeaderRefreshing ? { rotate: 360 } : {}}
              transition={isHeaderRefreshing ? { repeat: Infinity, duration: 1, ease: "linear" } : { type: "spring", stiffness: 200 }}
            >
              <RefreshCw size={19} className="transition duration-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)] sm:w-[22px] sm:h-[22px]" />
            </motion.div>
          </button>

          <button 
            onClick={() => setIsNotificationOpen(true)}
            className="p-1 sm:p-2 rounded-lg sm:rounded-xl transition relative group text-rose-400 hover:text-white hover:bg-white/10 shrink-0"
            aria-label="Notifications"
          >
            <motion.div
              animate={unreadCount > 0 ? {
                rotate: [0, -15, 15, -15, 15, 0],
                scale: [1, 1.2, 1],
                y: [0, -2, 0]
              } : {}}
              transition={{ 
                repeat: Infinity, 
                duration: 1.5, 
                repeatDelay: 2,
                ease: "easeInOut"
              }}
            >
              <Bell size={19} className={`transition duration-300 drop-shadow-[0_0_8px_rgba(251,113,133,0.8)] group-hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] sm:w-[22px] sm:h-[22px] ${unreadCount > 0 ? 'text-rose-500' : ''}`} />
            </motion.div>
            {unreadCount > 0 && (
              <motion.span 
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                className="absolute -top-1 -right-1 min-w-[15px] h-[15px] sm:min-w-[18px] sm:h-[18px] px-0.5 sm:px-1 bg-rose-500 text-white text-[8px] sm:text-[9px] font-black flex items-center justify-center rounded-full border-2 border-black shadow-[0_0_15px_rgba(244,63,94,0.8)] group-hover:scale-125 transition-transform"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 left-0 bottom-0 w-1/2 min-w-[260px] max-w-[320px] z-[101] shadow-2xl flex flex-col overflow-hidden ${darkMode ? 'bg-slate-950 border-r border-white/10' : 'bg-white border-r border-slate-200'}`}
            >
              <div className={`p-3.5 border-b flex flex-col space-y-3 ${darkMode ? 'border-white/10' : 'border-slate-100'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="relative w-7 h-7">
                      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500 to-blue-500 rounded-lg rotate-3 opacity-40"></div>
                      <div className={`relative w-full h-full rounded-lg overflow-hidden flex items-center justify-center border ${darkMode ? 'bg-neutral-900 border-white/10' : 'bg-white border-black/5'}`}>
                        <img src={stats?.appLogo || "/logo.jpg"} alt="Logo" className="w-4 h-4 object-contain rounded-sm" />
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-1">
                        <h1 className={`font-black text-sm tracking-tight leading-none ${darkMode ? 'text-white' : 'text-slate-900'}`}>BotFlow</h1>
                        <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                      </div>
                      <span className="text-[6.5px] font-black text-emerald-500 tracking-[0.2em] uppercase block">v3.7 • Premium Edition</span>
                      {stats?.loginUser && (
                        <span className={`text-[8.5px] font-medium mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {stats?.loginUser?.firstName || ''} {stats?.loginUser?.lastName || ''} {stats?.loginUser?.phone ? `(${stats?.loginUser?.phone})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setIsMenuOpen(false)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                    <X size={18} />
                  </button>
                </div>

                {/* Connected Shape */}
                <div className={`relative overflow-hidden rounded-xl p-2.5 border transition duration-500 ${
                  stats?.isUserBotConnected 
                    ? (darkMode ? 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-emerald-50 border-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.15)]')
                    : (darkMode ? 'bg-rose-500/10 border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.15)]' : 'bg-rose-50 border-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.15)]')
                }`}>
                  <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-6 -mt-6 opacity-40 ${
                    stats?.isUserBotConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}></div>
                  <div className="relative z-10 flex items-center space-x-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow relative shrink-0 ${
                      stats?.isUserBotConnected ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-rose-500 shadow-rose-500/30'
                    }`}>
                      <div className="absolute inset-0 rounded-full animate-ping opacity-50 bg-inherit"></div>
                      {stats?.isUserBotConnected ? <CheckCircle2 size={16} className="text-white relative z-10" /> : <X size={16} className="text-white relative z-10" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className={`text-xs font-black uppercase tracking-wider ${
                        stats?.isUserBotConnected ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-rose-400' : 'text-rose-600')
                      }`}>
                        {stats?.isUserBotConnected ? 'Connected' : 'Disconnected'}
                      </span>
                      <span className={`text-[8.5px] font-medium truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {stats?.isUserBotConnected ? 'System online' : 'System offline'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
                <button
                  onClick={() => {
                    setIsNotificationOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition group ${darkMode ? 'text-blue-400 hover:bg-white/5' : 'text-blue-600 hover:bg-black/5'}`}
                >
                  <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <Bell size={16} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-bold uppercase tracking-wide">Notifications</span>
                    <span className="text-[8px] opacity-50">View recent alerts</span>
                  </div>
                </button>
                
                <div className={`h-px my-1 ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`} />

                <button
                  onClick={() => {
                    setActiveTab('analytics');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition ${activeTab === 'analytics' ? (darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-50 text-cyan-600') : (darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5')}`}
                >
                  <PieChart size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Analytics</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('tester');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition ${activeTab === 'tester' ? (darkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-50 text-orange-600') : (darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5')}`}
                >
                  <Bot size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">AI Test</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('media');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition ${activeTab === 'media' ? (darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600') : (darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5')}`}
                >
                  <Library size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Media Library</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('insights');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition ${activeTab === 'insights' ? (darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600') : (darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5')}`}
                >
                  <BarChart3 size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Insights</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('user');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition ${activeTab === 'user' ? (darkMode ? 'bg-pink-500/20 text-pink-400' : 'bg-pink-50 text-pink-600') : (darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5')}`}
                >
                  <User size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Profile</span>
                </button>

                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleInstallApp();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition border font-bold text-[11px] uppercase tracking-wide ${
                    darkMode 
                      ? 'bg-gradient-to-r from-emerald-500/20 to-blue-500/20 text-emerald-300 border-emerald-500/40 hover:brightness-110 shadow-lg shadow-emerald-500/10' 
                      : 'bg-gradient-to-r from-emerald-50 to-blue-50 text-emerald-800 border-emerald-300 hover:brightness-105'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Download size={15} className="text-emerald-400 shrink-0 animate-bounce" />
                    <span>Download App / APK</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500 text-white font-mono font-black">
                    INSTALL
                  </span>
                </button>

                <button
                  onClick={() => {
                    handleForceUpdateAndPurge();
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition border font-bold text-[11px] uppercase tracking-wide ${
                    darkMode 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20' 
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <RefreshCw size={15} className="text-emerald-500 shrink-0" />
                    <span>Update & Flush Cache</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono font-black">
                    LATEST
                  </span>
                </button>

                <div className={`h-px my-1 ${darkMode ? 'bg-white/5' : 'bg-slate-100'}`} />

                <button
                  onClick={() => {
                    setShowClearDataConfirm(true);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition ${darkMode ? 'text-rose-400 hover:bg-white/5' : 'text-rose-600 hover:bg-black/5'}`}
                >
                  <Trash size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Clear All Data</span>
                </button>

                <button
                  onClick={() => {
                    setShowDeleteLastKeywordConfirm(true);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl transition ${darkMode ? 'text-rose-400 hover:bg-white/5' : 'text-rose-600 hover:bg-black/5'}`}
                >
                  <Trash2 size={16} />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Delete Last Keyword</span>
                </button>
              </div>

              <div className={`p-3 border-t ${darkMode ? 'border-white/10' : 'border-slate-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-50">Theme</span>
                  <button 
                    onClick={() => setDarkMode(!darkMode)}
                    className={`p-1.5 rounded-lg transition ${darkMode ? 'bg-white/5 text-yellow-400' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                  </button>
                </div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className={`w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${darkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Close Menu
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <NotificationPanel 
        isOpen={isNotificationOpen} 
        onClose={() => setIsNotificationOpen(false)} 
        logs={logs} 
        darkMode={darkMode} 
      />

      {/* Floating Dark Mode Button (Floating FAB with MoonStar / SunMedium icons) */}
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setDarkMode(!darkMode)}
        className={`fixed bottom-20 left-4 sm:left-6 z-40 p-3 rounded-full shadow-2xl transition-all duration-300 backdrop-blur-xl flex items-center justify-center border active:scale-95 ${
          activeTab === 'logs' ? 'opacity-0 pointer-events-none' : 'opacity-100'
        } ${
          darkMode 
            ? 'bg-neutral-900/90 text-amber-400 hover:bg-neutral-800 border-amber-400/30 shadow-[0_4px_25px_rgba(251,191,36,0.3)] ring-1 ring-amber-400/20' 
            : 'bg-white/95 text-indigo-600 hover:bg-slate-50 border-indigo-200/80 shadow-[0_4px_25px_rgba(99,102,241,0.25)] ring-1 ring-indigo-500/15'
        }`}
        title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {darkMode ? <SunMedium size={18} className="animate-spin-slow" /> : <MoonStar size={18} />}
      </motion.button>

      <main 
        className={`mx-auto relative z-10 overflow-x-hidden ${
          activeTab === 'logs' 
            ? 'max-w-none w-full p-0 pt-0 pb-0' 
            : 'max-w-md p-4 pt-20 pb-28'
        }`}
      >
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              <Dashboard 
                darkMode={darkMode}
                stats={stats}
                setActiveTab={setActiveTab}
                handleScanMissed={handleScanMissed}
                isScanningMissed={isScanningMissed}
                missedCount={missedCount}
                isCatchingUp={isCatchingUp}
                handleCancelCatchUp={handleCancelCatchUp}
                handleTogglePause={handleTogglePause}
                loading={loading}
                deferredPrompt={deferredPrompt}
                handleInstallApp={handleInstallApp}
                logs={logs}
              />
            </motion.div>
          )}

          {activeTab === 'catchup' && (
            <motion.div
              key="catchup"
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              <CatchUpPage 
                darkMode={darkMode} 
                setActiveTab={setActiveTab} 
                scannedItems={scannedItems} 
                handleClearAllMissed={handleClearAllMissed} 
                handleReplyToSingleMissed={handleReplyToSingleMissed} 
                replyingIds={replyingIds}
                handleScanMissed={handleScanMissed}
                isScanningMissed={isScanningMissed}
              />
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <SettingsPanel 
              darkMode={darkMode}
              targetGroupId={targetGroupId}
              setTargetGroupId={setTargetGroupId}
              telegramBotToken={telegramBotToken}
              setTelegramBotToken={setTelegramBotToken}
              autoReplyInput={autoReplyInput}
              deferredPrompt={deferredPrompt}
              handleInstallApp={handleInstallApp}
              onOpenLogoSelector={() => setIsLogoModalOpen(true)}
              onOpenInstallGuide={() => setIsInstallModalOpen(true)}
              appLogoInput={appLogoInput}
              setAppLogoInput={setAppLogoInput}
              setAutoReplyInput={setAutoReplyInput}
              autoReply2Enabled={autoReply2Enabled}
              setAutoReply2Enabled={setAutoReply2Enabled}
              autoReply2Input={autoReply2Input}
              setAutoReply2Input={setAutoReply2Input}
              autoReply2DelayInput={autoReply2DelayInput}
              setAutoReply2DelayInput={setAutoReply2DelayInput}
              delaySecondsInput={delaySecondsInput}
              setDelaySecondsInput={setDelaySecondsInput}
              keywordDelaySecondsInput={keywordDelaySecondsInput}
              setKeywordDelaySecondsInput={setKeywordDelaySecondsInput}
              handleToggleAutoReset={handleToggleAutoReset}
              autoResetKeywords={autoResetKeywords}
              handleToggleAiMode={handleToggleAiMode}
              aiModeEnabled={aiModeEnabled}
              geminiApiKeys={geminiApiKeys}
              setGeminiApiKeys={setGeminiApiKeys}
              verifyKey={verifyKey}
              aiPersona={aiPersona}
              setAiPersona={setAiPersona}
              handleTogglePhotoReply={handleTogglePhotoReply}
              photoReplyEnabled={photoReplyEnabled}
              photoReplyMessage={photoReplyMessage}
              setPhotoReplyMessage={setPhotoReplyMessage}
              handleTogglePhotoReplyMessage2={handleTogglePhotoReplyMessage2}
              photoReplyMessage2Enabled={photoReplyMessage2Enabled}
              photoReplyMessage2={photoReplyMessage2}
              setPhotoReplyMessage2={setPhotoReplyMessage2}
              photoReplyMessage2StartTime={photoReplyMessage2StartTime}
              setPhotoReplyMessage2StartTime={setPhotoReplyMessage2StartTime}
              photoReplyMessage2EndTime={photoReplyMessage2EndTime}
              setPhotoReplyMessage2EndTime={setPhotoReplyMessage2EndTime}
              topicIcon={topicIcon}
              setTopicIcon={setTopicIcon}
              topicRenameEmoji={topicRenameEmoji}
              setTopicRenameEmoji={setTopicRenameEmoji}
              photoReplyMax={photoReplyMax}
              setPhotoReplyMax={setPhotoReplyMax}
              handleToggleNotificationSound={handleToggleNotificationSound}
              notificationSoundEnabled={notificationSoundEnabled}
              notificationSoundType={notificationSoundType}
              handleUpdateNotificationSoundType={handleUpdateNotificationSoundType}
              requestNotificationPermission={requestNotificationPermission}
              testPush={testPush}
              notificationStyle={notificationStyle}
              setNotificationStyle={setNotificationStyle}
              showNotification={showNotification}
              handleExportData={handleExportData}
              handleImportData={handleImportData}
              fileInputRef={fileInputRef}
              importing={importing}
              onOpenDeleteLastImport={() => {
                fetchLastImportInfo();
                setShowDeleteLastKeywordConfirm(true);
              }}
              onOpenDeleteLastRule={() => {
                fetchLastImportInfo();
                setShowDeleteLastRuleConfirm(true);
              }}
              lastImportInfo={lastImportInfo}
              importBatches={importBatches}
              onDeleteBatch={(batchId, fileName, count) => setBatchToDelete({ batchId, fileName, count })}
              isFetchingBatches={isFetchingBatches}
              deletingBatchId={deletingBatchId}
              onRefreshBatches={fetchImportBatches}
              handleUpdateSettings={handleUpdateSettings}
              handleForceUpdateAndPurge={handleForceUpdateAndPurge}
              saving={saving}
              direction={direction}
              slideVariants={slideVariants}
              logs={logs}
              handleDownloadLogs={handleDownloadLogs}
              fetchLogs={fetchLogs}
              refreshingLogs={refreshingLogs}
              clearLogs={clearLogs}
              isConfirmingClear={isConfirmingClear}
              logSearch={logSearch}
              setLogSearch={setLogSearch}
              logLevelFilter={logLevelFilter}
              setLogLevelFilter={setLogLevelFilter}
              logCategoryFilter={logCategoryFilter}
              setLogCategoryFilter={setLogCategoryFilter}
              logCategories={logCategories}
              displayedLogs={displayedLogs}
              handleLogsScroll={handleLogsScroll}
              expandedLogId={expandedLogId}
              setExpandedLogId={setExpandedLogId}
              visibleLogsCount={visibleLogsCount}
              setVisibleLogsCount={setVisibleLogsCount}
              filteredLogsCount={filteredLogs.length}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'keywords' && (
            <KeywordsManager 
              darkMode={darkMode}
              keywordSearch={keywordSearch}
              setKeywordSearch={setKeywordSearch}
              isAddingNewRule={isAddingNewRule}
              setIsAddingNewRule={setIsAddingNewRule}
              editingKeywordId={editingKeywordId}
              keywords={keywords}
              handleAddKeyword={handleAddKeyword}
              handleDeleteKeyword={handleDeleteKeyword}
              handleToggleKeyword={handleToggleKeyword}
              handleToggleApprovalMode={handleToggleApprovalMode}
              handleToggleNotifyOnHit={handleToggleNotifyOnHit}
              handleDuplicateKeyword={handleDuplicateKeyword}
              fetchKeywords={fetchKeywords}
              cancelEdit={cancelEdit}
              visibleKeywordsCount={visibleKeywordsCount}
              handleKeywordsScroll={handleKeywordsScroll}
              keywordsTopRef={keywordsTopRef}
              direction={direction}
              slideVariants={slideVariants}
              isSearchFocused={isSearchFocused}
              setIsSearchFocused={setIsSearchFocused}
              displayedKeywords={displayedKeywords}
              filteredKeywords={filteredKeywords}
              keywordFilter={keywordFilter}
              setKeywordFilter={setKeywordFilter}
              handleEditKeyword={handleEditKeyword}
            />
          )}

          {activeTab === 'broadcast' && (
            <motion.div
              key="broadcast"
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-3.5 w-full pb-8"
            >
              <div ref={castTopRef} />

              {/* CARD 1: Block Topics (No Auto-Reply) */}
              <div className={`border p-4 sm:p-4.5 rounded-2xl space-y-3 transition-colors duration-300 relative overflow-hidden ${
                darkMode ? 'bg-neutral-900/90 border-rose-500/25 shadow-black/40' : 'bg-white border-rose-200/80 shadow-xs'
              }`}>
                <div className="relative z-10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-rose-500/15 text-rose-400' : 'bg-rose-50 text-rose-600'}`}>
                        <ShieldAlert size={14} />
                      </div>
                      <div>
                        <h3 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          Block Topics
                        </h3>
                        <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Disable auto-replies for specific topic link
                        </p>
                      </div>
                    </div>
                    {blockedTopics.length > 0 && (
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        darkMode ? 'bg-rose-500/15 text-rose-300' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {blockedTopics.length} blocked
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <div className={`absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                        <Link size={13} />
                      </div>
                      <input
                        type="text"
                        value={newBlockedTopicLink}
                        onChange={(e) => setNewBlockedTopicLink(e.target.value)}
                        placeholder="Paste topic link..."
                        className={`w-full h-8.5 pl-8 pr-2.5 border rounded-xl focus:ring-2 focus:ring-rose-500/30 outline-none text-xs transition font-medium ${
                          darkMode ? 'bg-neutral-800/80 border-white/10 text-white placeholder-slate-400' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleBlockTopic}
                      disabled={blockingTopic || !newBlockedTopicLink.trim()}
                      className={`h-8.5 px-3 rounded-xl font-bold uppercase tracking-wider text-[11px] transition flex items-center gap-1.5 flex-shrink-0 ${
                        blockingTopic || !newBlockedTopicLink.trim()
                          ? 'opacity-50 cursor-not-allowed bg-slate-400 text-white'
                          : 'bg-rose-600 text-white hover:bg-rose-500 shadow-xs'
                      }`}
                    >
                      {blockingTopic ? <RefreshCw size={12} className="animate-spin" /> : <ShieldAlert size={12} />}
                      <span>{blockedTopics.some(t => t.link === newBlockedTopicLink) ? 'Unblock' : 'Block'}</span>
                    </motion.button>
                  </div>

                  {blockedTopics.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-dashed border-slate-200 dark:border-white/10">
                      <div className="relative">
                        <div className={`absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                          <Search size={12} />
                        </div>
                        <input
                          type="text"
                          value={blockedTopicSearch}
                          onChange={(e) => setBlockedTopicSearch(e.target.value)}
                          placeholder="Search blocked topics..."
                          className={`w-full h-7.5 pl-7 pr-2 border rounded-lg outline-none text-[11px] transition ${
                            darkMode ? 'bg-neutral-800/60 border-white/10 text-white placeholder-slate-400' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                          }`}
                        />
                      </div>

                      <div className="grid gap-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {blockedTopics.filter(t => 
                          t.name?.toLowerCase().includes(blockedTopicSearch.toLowerCase()) || 
                          t.telegram_topic_id.toString().includes(blockedTopicSearch) ||
                          t.link?.toLowerCase().includes(blockedTopicSearch.toLowerCase())
                        ).map((topic) => (
                          <div key={topic._id} className={`flex items-center justify-between p-2 rounded-lg border transition ${
                            darkMode ? 'bg-neutral-800/40 border-white/5 hover:border-white/10' : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/80'
                          }`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`p-1 rounded ${darkMode ? 'bg-rose-500/15 text-rose-400' : 'bg-rose-100 text-rose-600'}`}>
                                <ShieldAlert size={12} />
                              </div>
                              <div className="min-w-0">
                                <p className={`text-[11px] font-semibold truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                  {topic.name && topic.name !== "Unknown Topic" ? topic.name : `Topic ID: ${topic.telegram_topic_id}`}
                                </p>
                                <p className={`text-[9.5px] truncate ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                                  {topic.link}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleUnblockTopic(topic._id, topic.name)}
                              className={`p-1 rounded-md transition ${darkMode ? 'hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'}`}
                              title="Unblock Topic"
                            >
                              <ShieldCheck size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 2: Broadcast Announcement */}
              <div className={`border p-4 sm:p-4.5 rounded-2xl space-y-3 transition-colors duration-300 relative overflow-hidden ${
                darkMode ? 'bg-neutral-900/90 border-purple-500/25 shadow-black/40' : 'bg-white border-purple-200/80 shadow-xs'
              }`}>
                <div className="relative z-10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                        <Megaphone size={14} />
                      </div>
                      <div>
                        <h3 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          Broadcast Message
                        </h3>
                        <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Send instant announcement to topics
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono font-semibold ${broadcastMessage.length > 500 ? 'text-rose-500' : darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                      {broadcastMessage.length}/500
                    </span>
                  </div>

                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Type broadcast message here..."
                    disabled={broadcasting}
                    className={`w-full h-24 p-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500/30 outline-none text-xs transition resize-none font-medium ${
                      darkMode ? 'bg-neutral-800/80 border-white/10 text-white placeholder-slate-400' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                    } ${broadcasting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />

                  {/* Broadcast Target Toggle */}
                  <div className="space-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Target
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setBroadcastTarget('all')}
                        disabled={broadcasting}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                          broadcastTarget === 'all'
                            ? (darkMode ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-purple-50 border-purple-400 text-purple-700')
                            : (darkMode ? 'bg-neutral-800/60 border-white/5 text-slate-400 hover:text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100')
                        } ${broadcasting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <LayoutGrid size={13} />
                        <span>All Topics</span>
                      </button>
                      <button
                        onClick={() => setBroadcastTarget('general')}
                        disabled={broadcasting}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                          broadcastTarget === 'general'
                            ? (darkMode ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-purple-50 border-purple-400 text-purple-700')
                            : (darkMode ? 'bg-neutral-800/60 border-white/5 text-slate-400 hover:text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100')
                        } ${broadcasting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <MessageSquare size={13} />
                        <span>General Only</span>
                      </button>
                    </div>
                  </div>

                  {broadcasting && broadcastProgress.status === 'running' && broadcastTarget === 'all' && (
                    <div className="space-y-2 p-2.5 rounded-xl border border-purple-500/20 bg-purple-500/5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                        <span className={darkMode ? 'text-purple-300' : 'text-purple-700'}>Sending Broadcast</span>
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                          {broadcastProgress.current} / {broadcastProgress.total}
                        </span>
                      </div>
                      <div className={`h-2 w-full rounded-full overflow-hidden ${darkMode ? 'bg-purple-950/60' : 'bg-purple-100'}`}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(broadcastProgress.current / (broadcastProgress.total || 1)) * 100}%` }}
                          className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleCancelBroadcast}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                            darkMode ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleBroadcast}
                    disabled={broadcasting || !broadcastMessage.trim() || broadcastMessage.length > 500}
                    className={`w-full py-2.5 rounded-xl font-bold uppercase tracking-wider text-xs transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 ${
                      darkMode 
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500' 
                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
                    }`}
                  >
                    <Send size={14} />
                    <span>{broadcasting ? 'Sending Announcement...' : 'Broadcast Now'}</span>
                  </button>
                </div>
              </div>

              {/* CARD 3: Auto-Block Keywords */}
              <div className={`border p-4 sm:p-4.5 rounded-2xl space-y-3 transition-colors duration-300 relative overflow-hidden ${
                darkMode ? 'bg-neutral-900/90 border-teal-500/25 shadow-black/40' : 'bg-white border-teal-200/80 shadow-xs'
              }`}>
                <div className="relative z-10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-teal-500/15 text-teal-400' : 'bg-teal-50 text-teal-600'}`}>
                        <ShieldAlert size={14} />
                      </div>
                      <div>
                        <h3 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          Auto-Block Keywords
                        </h3>
                        <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Auto-block topics containing matched keywords
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoBlockKeywordsExpanded(!autoBlockKeywordsExpanded)}
                      className={`p-1.5 rounded-lg border text-xs transition ${
                        darkMode ? 'border-white/10 hover:bg-white/10 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                      }`}
                      title={autoBlockKeywordsExpanded ? "Collapse" : "Expand"}
                    >
                      {autoBlockKeywordsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                  
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={addAutoBlockKeyword}
                        className="py-1.5 px-3 rounded-lg font-bold uppercase tracking-wider text-[11px] transition flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                      >
                        <Plus size={13} />
                        <span>Add Keyword</span>
                      </button>

                      <button
                        onClick={handleUpdateAutoBlockKeywords}
                        disabled={saving}
                        className={`py-1.5 px-3 rounded-lg font-bold uppercase tracking-wider text-[11px] transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs ${
                          saving 
                            ? 'bg-slate-400 text-white cursor-not-allowed' 
                            : 'bg-teal-600 hover:bg-teal-500 text-white'
                        }`}
                      >
                        {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        <span>Save Rules</span>
                      </button>
                    </div>

                    <AnimatePresence>
                      {autoBlockKeywordsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-2 overflow-hidden pt-1"
                        >
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                            {autoBlockKeywords.map((item, index) => (
                              <div key={index} className={`p-2.5 rounded-xl border space-y-2 ${
                                darkMode ? 'bg-neutral-800/50 border-white/5' : 'bg-slate-50 border-slate-200/80 shadow-xs'
                              }`}>
                                <div className="flex items-center gap-2 w-full">
                                  <input
                                    type="text"
                                    value={item.keyword}
                                    onChange={(e) => updateAutoBlockKeyword(index, 'keyword', e.target.value)}
                                    placeholder="Enter block keyword..."
                                    className={`flex-1 min-w-0 h-8 px-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500/30 outline-none text-xs transition font-medium ${
                                      darkMode ? 'bg-neutral-900 border-white/10 text-white placeholder-slate-400' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                                    }`}
                                  />
                                  <button
                                    onClick={() => removeAutoBlockKeyword(index)}
                                    className={`p-1.5 rounded-lg transition ${
                                      darkMode ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                                    }`}
                                    title="Delete Keyword"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Match Mode
                                  </span>
                                  <div className="flex bg-slate-200/70 dark:bg-neutral-900 rounded-md p-0.5 border dark:border-white/5 border-slate-200">
                                    <button
                                      onClick={() => updateAutoBlockKeyword(index, 'matchMode', 'exact')}
                                      className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider transition ${
                                        item.matchMode === 'exact' 
                                          ? (darkMode ? 'bg-teal-600 text-white' : 'bg-white shadow-xs text-slate-900 font-extrabold') 
                                          : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')
                                      }`}
                                    >
                                      Exact
                                    </button>
                                    <button
                                      onClick={() => updateAutoBlockKeyword(index, 'matchMode', 'partial')}
                                      className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider transition ${
                                        item.matchMode === 'partial' 
                                          ? (darkMode ? 'bg-teal-600 text-white' : 'bg-white shadow-xs text-slate-900 font-extrabold') 
                                          : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')
                                      }`}
                                    >
                                      Partial
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
              <div ref={castBottomRef} />

              {/* Floating Quick Scroll Buttons for Cast */}
              <div className={`fixed bottom-20 left-4 flex flex-col rounded-full shadow-lg border overflow-hidden z-40 backdrop-blur-md ${
                darkMode ? 'bg-neutral-900/90 border-white/10 shadow-black/60' : 'bg-white/95 border-slate-200 shadow-slate-300/80'
              }`}>
                <motion.button
                  whileHover={{ backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={scrollToCastTop}
                  className={`p-2 transition ${darkMode ? 'text-purple-300' : 'text-purple-600'}`}
                  title="Scroll to top"
                >
                  <ArrowUp size={16} />
                </motion.button>
                <div className={`h-px w-full ${darkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
                <motion.button
                  whileHover={{ backgroundColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={scrollToCastBottom}
                  className={`p-2 transition ${darkMode ? 'text-purple-300' : 'text-purple-600'}`}
                  title="Scroll to bottom"
                >
                  <ArrowDown size={16} />
                </motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === 'user' && (
            <UserManager
              darkMode={darkMode}
              stats={stats}
              timer={timer}
              fetchStats={fetchStats}
              setShowLogoutConfirm={setShowLogoutConfirm}
              deferredPrompt={deferredPrompt}
              handleInstallApp={handleInstallApp}
              authStep={authStep as any}
              setAuthStep={setAuthStep as any}
              apiIdInput={apiIdInput}
              setApiIdInput={setApiIdInput}
              apiHashInput={apiHashInput}
              setApiHashInput={setApiHashInput}
              phoneNumberInput={phone}
              setPhoneNumberInput={setPhone}
              handleSendCode={handleSendCode}
              isSendingCode={authLoading}
              phoneCodeInput={code}
              setPhoneCodeInput={setCode}
              handleVerifyCode={handleSignIn}
              isVerifyingCode={authLoading}
              twoFactorInput={password}
              setTwoFactorInput={setPassword}
              direction={direction}
              slideVariants={slideVariants}
              handleSaveApiCredentials={handleUpdateSettings}
            />
          )}

          {activeTab === 'analytics' && (
            <Analytics 
              darkMode={darkMode}
              direction={direction}
              slideVariants={slideVariants}
            />
          )}

          {activeTab === 'tester' && (
            <motion.div
              key="tester"
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6 w-full"
            >
              <div className={`border p-8 rounded-[2.5rem] space-y-6 transition-colors duration-500 glow-orange relative overflow-hidden group ${darkMode ? 'bg-orange-950/40 border-orange-500/30' : 'bg-orange-50 border-orange-200 shadow-xl shadow-orange-500/10'}`}>
                <div className={`absolute inset-0 pattern-dots opacity-[0.05] pointer-events-none ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                <div className="relative z-10 space-y-6 pointer-events-auto">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-500/10 text-orange-600'}`}>
                      <Bot size={14} />
                    </div>
                    <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>AI Persona Tester</h3>
                  </div>
                  
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Test your current AI Persona settings before they go live. This uses the persona defined in Settings.
                  </p>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Test Message</label>
                      <textarea
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        placeholder="Type a message a user might send..."
                        rows={3}
                        className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm transition ${darkMode ? 'bg-orange-500/5 border-orange-500/20 text-white placeholder-white/20' : 'bg-orange-50 border-orange-200 text-slate-900 placeholder-slate-400'}`}
                      />
                    </div>
                    
                    <button
                      onClick={handleTestPersona}
                      disabled={isTesting || !testMessage.trim()}
                      className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition flex items-center justify-center space-x-2 shadow-lg ${
                        isTesting || !testMessage.trim() 
                          ? (darkMode ? 'bg-neutral-800 text-neutral-500' : 'bg-slate-200 text-slate-400') 
                          : 'bg-orange-500 text-white shadow-orange-500/20 hover:bg-orange-600'
                      }`}
                    >
                      {isTesting ? <RefreshCw className="animate-spin" size={16} /> : <MessageCircle size={16} />}
                      <span>Test AI Response</span>
                    </button>
                  </div>

                  <AnimatePresence>
                    {testReply && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-2xl border ${darkMode ? 'bg-black/40 border-orange-500/20' : 'bg-white/60 border-orange-200'}`}
                      >
                        <div className="flex items-center space-x-2 mb-2">
                          <Bot size={14} className={darkMode ? 'text-orange-400' : 'text-orange-600'} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>AI Reply</span>
                        </div>
                        <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {testReply}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div
              key="insights"
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6 w-full"
            >
              {/* ✨ AI Smart Keyword Suggestions (Feature 5) */}
              <div className={`border p-8 rounded-[2.5rem] space-y-6 transition-colors duration-500 glow-blue relative overflow-hidden group ${darkMode ? 'bg-slate-900/60 border-blue-500/30' : 'bg-blue-50/40 border-blue-200 shadow-xl shadow-blue-500/5'}`}>
                <div className={`absolute inset-0 pattern-grid opacity-[0.05] pointer-events-none ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <div className="relative z-10 space-y-6 pointer-events-auto">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-500/10 text-blue-600'}`}>
                        <Sparkles size={14} className="animate-pulse text-blue-400" />
                      </div>
                      <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>AI Keyword & Automation Assistant</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-blue-500 text-white tracking-widest animate-pulse">Gemini 3.8-Flash</span>
                  </div>

                  <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Let Gemini analyze your bot's recent message notifications and trigger logs to recommend optimized, ready-to-use smart auto-replies. Prevent manual study batch requests and boost conversion rates!
                  </p>

                  <button
                    onClick={handleGenerateSuggestions}
                    disabled={isGeneratingSuggestions}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition flex items-center justify-center space-x-2 shadow-lg ${
                      isGeneratingSuggestions 
                        ? (darkMode ? 'bg-neutral-800 text-neutral-500' : 'bg-slate-200 text-slate-400') 
                        : 'bg-blue-500 text-white hover:bg-blue-600 shadow-blue-500/20'
                    }`}
                  >
                    {isGeneratingSuggestions ? (
                      <>
                        <RefreshCw className="animate-spin" size={16} />
                        <span>Analyzing Log Trends...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Generate Smart AI Suggestions</span>
                      </>
                    )}
                  </button>

                  {aiSuggestionsError && (
                    <div className={`p-4 rounded-xl text-xs font-medium border ${darkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                      {aiSuggestionsError}
                    </div>
                  )}

                  {aiSuggestions && aiSuggestions.length > 0 && (
                    <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <h4 className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Recommended Automation Rules</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {aiSuggestions.map((sug, idx) => {
                          const isAdded = addedSuggestions.includes(sug.keyword);
                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: idx * 0.05 }}
                              className={`p-5 rounded-3xl border transition flex flex-col justify-between ${
                                darkMode 
                                  ? 'bg-neutral-950/60 border-white/5 hover:border-blue-500/20' 
                                  : 'bg-white border-slate-100 hover:border-blue-300 shadow-sm'
                              }`}
                            >
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                    darkMode ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-600 border border-blue-100'
                                  }`}>
                                    {sug.category}
                                  </span>
                                  <span className={`text-[9px] font-mono opacity-60 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Matches: partial
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <div className={`text-xs font-black ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                    Trigger: <span className="text-blue-500">"{sug.keyword}"</span>
                                  </div>
                                  {sug.keywords && sug.keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {sug.keywords.map((syn: string, synIdx: number) => (
                                        <span key={synIdx} className={`text-[8.5px] font-medium px-1.5 py-0.25 rounded ${darkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                          {syn}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className={`p-3 rounded-2xl border text-xs whitespace-pre-wrap leading-relaxed ${
                                  darkMode ? 'bg-black/40 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-100 text-slate-600'
                                }`}>
                                  {sug.reply}
                                </div>

                                <p className={`text-[10px] italic leading-normal ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  💡 {sug.explanation}
                                </p>
                              </div>

                              <div className="pt-4 mt-auto">
                                <button
                                  onClick={() => handleAddSuggestedKeyword(sug)}
                                  disabled={isAdded}
                                  className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-[9px] transition flex items-center justify-center space-x-1.5 ${
                                    isAdded 
                                      ? 'bg-emerald-500 text-white cursor-default' 
                                      : (darkMode ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white border border-blue-200')
                                  }`}
                                >
                                  {isAdded ? (
                                    <>
                                      <Check size={12} />
                                      <span>Rule Added to Bot</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus size={12} />
                                      <span>Add to Bot Rules</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={`border p-8 rounded-[2.5rem] space-y-6 transition-colors duration-500 glow-rose relative overflow-hidden group ${darkMode ? 'bg-rose-950/40 border-rose-500/30' : 'bg-rose-50 border-rose-200 shadow-xl shadow-rose-500/10'}`}>
                <div className={`absolute inset-0 pattern-dots opacity-[0.05] pointer-events-none ${darkMode ? 'text-rose-400' : 'text-rose-600'}`} />
                <div className="relative z-10 space-y-6 pointer-events-auto">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-500/10 text-rose-600'}`}>
                      <Calendar size={14} />
                    </div>
                    <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-rose-400' : 'text-rose-600'}`}>Activity Heatmap</h3>
                  </div>
                  
                  <div className="overflow-x-auto pb-2 custom-scrollbar">
                    <div className="flex space-x-1 min-w-max">
                      <div className="flex flex-col space-y-1 pr-2">
                        {['Mon', 'Wed', 'Fri', 'Sun'].map(day => (
                          <span key={day} className="text-[8px] h-3 flex items-center text-slate-500 font-bold uppercase">{day}</span>
                        ))}
                      </div>
                      <div className="grid grid-flow-col grid-rows-7 gap-1">
                        {activityHeatmap.map((item, i) => (
                          <div 
                            key={i}
                            className={`w-3 h-3 rounded-sm transition hover:scale-125 cursor-pointer ${
                              item.value === 0 ? (darkMode ? 'bg-neutral-800' : 'bg-slate-200') :
                              item.value < 3 ? 'bg-rose-500/20' :
                              item.value < 6 ? 'bg-rose-500/50' :
                              'bg-rose-500'
                            }`}
                            title={`${item.day} ${item.hour}:00 - ${item.value} messages`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end space-x-2 text-[8px] font-bold uppercase text-slate-500">
                    <span>Less</span>
                    <div className="flex space-x-1">
                      <div className={`w-2 h-2 rounded-sm ${darkMode ? 'bg-neutral-800' : 'bg-slate-200'}`} />
                      <div className="w-2 h-2 rounded-sm bg-rose-500/20" />
                      <div className="w-2 h-2 rounded-sm bg-rose-500/50" />
                      <div className="w-2 h-2 rounded-sm bg-rose-500" />
                    </div>
                    <span>More</span>
                  </div>
                </div>
              </div>

              <div className={`border p-8 rounded-[2.5rem] space-y-6 transition-colors duration-500 glow-amber relative overflow-hidden group ${darkMode ? 'bg-amber-950/40 border-amber-500/30' : 'bg-amber-50 border-amber-200 shadow-xl shadow-amber-500/10'}`}>
                <div className={`absolute inset-0 pattern-grid opacity-[0.05] pointer-events-none ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                <div className="relative z-10 space-y-6 pointer-events-auto">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/10 text-amber-600'}`}>
                      <Users size={14} />
                    </div>
                    <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>Top Interacting Users</h3>
                  </div>
                  
                  <div className="space-y-3">
                    {userLeaderboard.map((user, i) => (
                      <div key={user.username} className={`flex items-center justify-between p-3 rounded-2xl border transition ${darkMode ? 'bg-black/40 border-white/5' : 'bg-white/60 border-black/5'}`}>
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                            i === 0 ? 'bg-amber-500 text-white' : 
                            i === 1 ? 'bg-slate-400 text-white' : 
                            i === 2 ? 'bg-orange-400 text-white' : 
                            (darkMode ? 'bg-neutral-800 text-slate-400' : 'bg-slate-100 text-slate-500')
                          }`}>
                            {i + 1}
                          </div>
                          <span className={`text-xs font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>@{user.username}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-black ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>{user.count}</span>
                          <span className="text-[8px] font-bold uppercase text-slate-500">Replies</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`border p-8 rounded-[2.5rem] space-y-6 transition-colors duration-500 glow-emerald relative overflow-hidden group ${darkMode ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200 shadow-xl shadow-emerald-500/10'}`}>
                <div className={`absolute inset-0 pattern-dots opacity-[0.05] pointer-events-none ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <div className="relative z-10 space-y-6 pointer-events-auto">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 text-emerald-600'}`}>
                      <Database size={14} />
                    </div>
                    <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Data Management</h3>
                  </div>
                  
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Backup your entire bot configuration including keywords, settings, and AI personas.
                  </p>

                  <button
                    onClick={handleExportConfig}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition flex items-center justify-center space-x-2 shadow-lg ${darkMode ? 'bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-500' : 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600'}`}
                  >
                    <Download size={16} />
                    <span>Export Configuration</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'media' && (
            <motion.div
              key="media"
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6 w-full"
            >
              <div className={`border p-8 rounded-[2.5rem] space-y-6 transition-colors duration-500 glow-indigo relative overflow-hidden group ${darkMode ? 'bg-indigo-950/40 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200 shadow-xl shadow-indigo-500/10'}`}>
                <div className={`absolute inset-0 pattern-dots opacity-[0.05] pointer-events-none ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                <div className="relative z-10 space-y-6 pointer-events-auto">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-500/10 text-indigo-600'}`}>
                      <Library size={14} />
                    </div>
                    <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>Media Library</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Media Name</label>
                        <input
                          type="text"
                          value={newMediaName}
                          onChange={(e) => setNewMediaName(e.target.value)}
                          placeholder="e.g. Banner"
                          className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs transition ${darkMode ? 'bg-indigo-500/5 border-indigo-500/20 text-white placeholder-white/20' : 'bg-indigo-50 border-indigo-200 text-slate-900 placeholder-slate-400'}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={`text-[9px] font-black uppercase tracking-widest ml-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Media URL</label>
                        <input
                          type="text"
                          value={newMediaUrl}
                          onChange={(e) => setNewMediaUrl(e.target.value)}
                          placeholder="https://..."
                          className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs transition ${darkMode ? 'bg-indigo-500/5 border-indigo-500/20 text-white placeholder-white/20' : 'bg-indigo-50 border-indigo-200 text-slate-900 placeholder-slate-400'}`}
                        />
                      </div>
                    </div>
                    
                    <button
                      onClick={handleAddMedia}
                      disabled={!newMediaUrl.trim() || !newMediaName.trim()}
                      className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition flex items-center justify-center space-x-2 shadow-lg ${
                        !newMediaUrl.trim() || !newMediaName.trim()
                          ? (darkMode ? 'bg-neutral-800 text-neutral-500' : 'bg-slate-200 text-slate-400') 
                          : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600'
                      }`}
                    >
                      <Plus size={16} />
                      <span>Add to Library</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mt-6">
                    {mediaItems.length === 0 ? (
                      <div className="text-center py-12 opacity-40 italic text-sm">No media in library yet.</div>
                    ) : (
                      mediaItems.map(item => (
                        <div key={item._id} className={`group relative rounded-3xl overflow-hidden border transition ${darkMode ? 'bg-black/40 border-white/5' : 'bg-white border-black/5 shadow-sm'}`}>
                          <div className="aspect-video w-full overflow-hidden">
                            <img src={item.url} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                          </div>
                          <div className={`p-4 flex items-center justify-between ${darkMode ? 'bg-neutral-900/80' : 'bg-white/90'} backdrop-blur-md`}>
                            <div>
                              <h4 className={`text-xs font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</h4>
                              <p className="text-[9px] text-slate-500 font-mono truncate max-w-[150px]">{item.url}</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(item.url);
                                  showNotification('success', 'URL copied to clipboard');
                                }}
                                className={`p-2 rounded-xl transition ${darkMode ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-black/5 text-slate-500 hover:text-black'}`}
                                title="Copy URL"
                              >
                                <Link size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteMedia(item._id)}
                                className={`p-2 rounded-xl transition ${darkMode ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                                title="Delete"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'photo_stats' && (
            <motion.div
              key="photo_stats"
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6 w-full"
            >
              <div className={`border p-6 rounded-[2.5rem] space-y-6 transition-colors duration-500 relative overflow-hidden group ${darkMode ? 'bg-amber-950/40 border-amber-500/30' : 'bg-amber-50 border-amber-200 shadow-xl shadow-amber-500/10'}`}>
                <div className={`absolute inset-0 pattern-lines opacity-[0.05] pointer-events-none ${darkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button 
                      onClick={() => setActiveTab('dashboard')}
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center transition ${darkMode ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h2 className={`text-2xl font-black tracking-tight flex items-center ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Photo Sent Activity
                      </h2>
                      <div className="flex space-x-2 mt-1">
                        <button 
                          onClick={() => setPhotoStatsTab('today')}
                          className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${photoStatsTab === 'today' ? (darkMode ? 'bg-amber-500 text-white' : 'bg-amber-600 text-white') : (darkMode ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-100 text-amber-600 hover:bg-amber-200')}`}
                        >
                          Today (IST)
                        </button>
                        <button 
                          onClick={() => setPhotoStatsTab('24h')}
                          className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${photoStatsTab === '24h' ? (darkMode ? 'bg-amber-500 text-white' : 'bg-amber-600 text-white') : (darkMode ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-100 text-amber-600 hover:bg-amber-200')}`}
                        >
                          Past 24h
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-500'}`}>
                    <Image size={24} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-amber-200/50 shadow-sm'}`}>
                    <span className={`text-[9px] uppercase font-black tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Today Total</span>
                    <div className={`text-xl font-black mt-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                      {stats?.todayPhotoSentStats?.count || 0}
                    </div>
                  </div>
                  <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-amber-200/50 shadow-sm'}`}>
                    <span className={`text-[9px] uppercase font-black tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Last 24h</span>
                    <div className={`text-xl font-black mt-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      {stats?.past24hPhotoSentStats?.count || 0}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                  {(photoStatsTab === 'today' ? stats?.todayPhotoSentStats?.topics : stats?.past24hPhotoSentStats?.topics)?.length ? (
                    (photoStatsTab === 'today' ? stats?.todayPhotoSentStats?.topics : stats?.past24hPhotoSentStats?.topics)?.map((topic, idx) => (
                      <div key={idx} className={`p-3 rounded-2xl flex items-center justify-between group transition ${darkMode ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-white hover:bg-slate-50 shadow-sm'}`}>
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                            <Hash size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className={`font-bold text-xs truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{topic.name}</p>
                            <p className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{topic.time}</p>
                          </div>
                        </div>
                        {topic.link && (
                          <a 
                            href={topic.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition ${darkMode ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white' : 'bg-amber-100 text-amber-600 hover:bg-amber-600 hover:text-white'}`}
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest">Open</span>
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className={`text-center py-12 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <Image size={32} className="mx-auto mb-4 opacity-20" />
                      <p className="text-xs font-medium">No activity recorded for this period.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'approvals' && (
            <ApprovalDashboard 
              darkMode={darkMode}
              direction={direction}
              slideVariants={slideVariants}
            />
          )}

          {activeTab === 'logs' && (
            <ActivityLogs 
              darkMode={darkMode}
              handleDownloadLogs={handleDownloadLogs}
              fetchLogs={fetchLogs}
              refreshingLogs={refreshingLogs}
              direction={direction}
              slideVariants={slideVariants}
              clearLogs={clearLogs}
              isConfirmingClear={isConfirmingClear}
              logSearch={logSearch}
              setLogSearch={setLogSearch}
              logLevelFilter={logLevelFilter}
              setLogLevelFilter={setLogLevelFilter}
              logCategoryFilter={logCategoryFilter}
              setLogCategoryFilter={setLogCategoryFilter}
              logCategories={logCategories}
              displayedLogs={displayedLogs}
              handleLogsScroll={handleLogsScroll}
              expandedLogId={expandedLogId}
              setExpandedLogId={setExpandedLogId}
              visibleLogsCount={visibleLogsCount}
              setVisibleLogsCount={setVisibleLogsCount}
              filteredLogsCount={filteredLogs.length}
              showNotification={showNotification}
              setActiveTab={setActiveTab}
            />
          )}
        </AnimatePresence>
        </main>

      {/* Floating Bottom Navigation Bar */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[95%] max-w-sm sm:max-w-md z-50 transition-all duration-300">
        <nav className={`rounded-2xl sm:rounded-full border px-2 py-1.5 flex items-center justify-around transition-all duration-300 shadow-2xl backdrop-blur-xl ${
          darkMode 
            ? 'bg-slate-950/90 border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.85)]' 
            : 'bg-white/95 border-slate-200/90 shadow-[0_12px_40px_rgba(0,0,0,0.14)]'
        }`}>
          <TabButton id="dashboard" icon={Home} label="Home" activeTab={activeTab} setActiveTab={setActiveTab} setDirection={setDirection} darkMode={darkMode} />
          <TabButton id="keywords" icon={Key} label="Rules" activeTab={activeTab} setActiveTab={setActiveTab} setDirection={setDirection} darkMode={darkMode} />
          <TabButton id="approvals" icon={ShieldCheck} label="Check" activeTab={activeTab} setActiveTab={setActiveTab} setDirection={setDirection} darkMode={darkMode} />
          <TabButton id="broadcast" icon={Megaphone} label="Cast" activeTab={activeTab} setActiveTab={setActiveTab} setDirection={setDirection} darkMode={darkMode} />
          <TabButton id="settings" icon={SlidersHorizontal} label="Settings" activeTab={activeTab} setActiveTab={setActiveTab} setDirection={setDirection} darkMode={darkMode} />
        </nav>
      </div>

      {/* Notifications */}
      <Toaster position="top-right" />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmationId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-sm p-6 rounded-3xl shadow-2xl ${darkMode ? 'bg-neutral-900 border border-neutral-800' : 'bg-white'}`}
            >
              <h3 className={`text-lg font-black uppercase tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Confirm Delete</h3>
              <p className={`text-sm mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Are you sure you want to delete this keyword rule? This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setDeleteConfirmationId(null)}
                  className={`flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors ${darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteKeyword}
                  className="flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-xs bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Pause Confirmation Modal */}
      <AnimatePresence>
        {showPauseConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className={`w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl border relative overflow-hidden ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-100'
              }`}
            >
              <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 ${stats?.isSystemPaused ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              
              <div className="relative z-10 text-center">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 transition-transform duration-500 hover:rotate-12 ${
                  stats?.isSystemPaused 
                    ? (darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600') 
                    : (darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600')
                }`}>
                  {stats?.isSystemPaused ? <Play size={40} fill="currentColor" /> : <Pause size={40} fill="currentColor" />}
                </div>
                
                <h3 className={`text-2xl font-black tracking-tight mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats?.isSystemPaused ? 'Resume System?' : 'Pause System?'}
                </h3>
                <p className={`text-sm mb-8 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {stats?.isSystemPaused 
                    ? 'The bot will start replying to messages again based on your rules.' 
                    : 'The bot will stop all automated replies until you resume it manually.'}
                </p>
                
                <div className="flex flex-col space-y-3">
                  <button
                    onClick={confirmTogglePause}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition shadow-lg ${
                      stats?.isSystemPaused 
                        ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' 
                        : 'bg-rose-500 text-white shadow-rose-500/20 hover:bg-rose-600'
                    }`}
                  >
                    {stats?.isSystemPaused ? 'Yes, Resume Now' : 'Yes, Pause Now'}
                  </button>
                  <button
                    onClick={() => setShowPauseConfirmation(false)}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition ${
                      darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scan Missed Modal */}
      <AnimatePresence>
        {showScanModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
            >
              <div className={`p-6 border-b flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                    <Search size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">Scan Results</h3>
                    <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {scannedItems.length} new missed keywords found
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowScanModal(false)}
                  className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {scannedItems.length === 0 ? (
                  <div className="text-center py-8">
                    <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 ${darkMode ? 'bg-slate-800/50 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                      <Check size={32} />
                    </div>
                    <h4 className="text-lg font-bold mb-1">All Caught Up!</h4>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No new missed keywords were found in the recent topics.</p>
                  </div>
                ) : (
                  scannedItems.map((item) => {
                    const isSelected = selectedScannedItems.has(item._id);
                    return (
                      <div 
                        key={item._id} 
                        onClick={() => {
                          const newSet = new Set(selectedScannedItems);
                          if (isSelected) newSet.delete(item._id);
                          else newSet.add(item._id);
                          setSelectedScannedItems(newSet);
                        }}
                        className={`p-4 rounded-2xl border cursor-pointer transition-colors flex items-start space-x-4 ${
                          isSelected 
                            ? (darkMode ? 'bg-indigo-900/20 border-indigo-500/50' : 'bg-indigo-50 border-indigo-200')
                            : (darkMode ? 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50' : 'bg-slate-50 border-slate-200 hover:bg-slate-100')
                        }`}
                      >
                        <div className={`mt-1 w-5 h-5 rounded flex items-center justify-center border ${
                          isSelected 
                            ? 'bg-indigo-500 border-indigo-500 text-white' 
                            : (darkMode ? 'border-slate-600' : 'border-slate-300')
                        }`}>
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${darkMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>
                              {item.topicName}
                            </span>
                            <span className={`text-[10px] font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {new Date(item.date).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className={`text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Keyword: <span className="text-amber-500">"{item.keyword}"</span>
                          </p>
                          <p className={`text-xs italic line-clamp-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            "{item.text}"
                          </p>
                          <div className="mt-4 flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReplyToSingleMissed(item._id);
                              }}
                              disabled={replyingIds.has(item._id)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center space-x-2 transition ${
                                replyingIds.has(item._id)
                                  ? 'bg-slate-400 text-white cursor-not-allowed'
                                  : (darkMode ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100')
                              }`}
                            >
                              {replyingIds.has(item._id) ? (
                                <RefreshCw className="animate-spin" size={12} />
                              ) : (
                                <Send size={12} />
                              )}
                              <span>{replyingIds.has(item._id) ? 'Replying...' : 'Reply Now'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className={`p-6 border-t flex items-center justify-end space-x-3 ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}`}>
                {isCatchingUp ? (
                  <button
                    onClick={handleCancelCatchUp}
                    className="px-6 py-3 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 flex items-center space-x-2"
                  >
                    <RefreshCw className="animate-spin" size={16} />
                    <span>Cancel Catch Up</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setShowScanModal(false)}
                      className={`px-6 py-3 rounded-xl text-sm font-bold transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-600'}`}
                    >
                      Close
                    </button>
                    {scannedItems.length > 0 && (
                      <button
                        onClick={() => {
                          if (selectedScannedItems.size === 0) {
                            showNotification('error', 'Please select at least one item');
                            return;
                          }
                          handleCatchUp(Array.from(selectedScannedItems));
                        }}
                        disabled={selectedScannedItems.size === 0}
                        className={`px-6 py-3 rounded-xl text-sm font-bold text-white transition-colors shadow-lg ${
                          selectedScannedItems.size === 0
                            ? 'bg-slate-400 cursor-not-allowed shadow-none'
                            : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20'
                        }`}
                      >
                        Catch Up Selected ({selectedScannedItems.size})
                      </button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear Data Confirmation Modal */}
      <AnimatePresence>
        {showClearDataConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className={`w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl border relative overflow-hidden ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-100'
              }`}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 bg-rose-500" />
              
              <div className="relative z-10 text-center">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 transition-transform duration-500 hover:rotate-12 ${
                  darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600'
                }`}>
                  <Trash size={40} />
                </div>
                
                <h3 className={`text-2xl font-black tracking-tight mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Clear All Data?
                </h3>
                <p className={`text-sm mb-8 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  This will permanently delete all logs, keywords, and media. This action cannot be undone.
                </p>
                
                <div className="flex flex-col space-y-3">
                  <button
                    onClick={async () => {
                      await fetch("/api/data/clear", { method: "DELETE" });
                      setShowClearDataConfirm(false);
                      window.location.reload();
                    }}
                    className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs text-white bg-rose-500 hover:bg-rose-600 shadow-xl shadow-rose-500/20 transition"
                  >
                    Confirm Clear
                  </button>
                  <button
                    onClick={() => setShowClearDataConfirm(false)}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition ${
                      darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Last Import Confirmation Modal (Whole File Batch) */}
      <AnimatePresence>
        {showDeleteLastKeywordConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              className={`w-full max-w-sm p-6 sm:p-7 rounded-[2rem] shadow-2xl border relative overflow-hidden ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-100'
              }`}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 bg-rose-500" />
              
              <div className="relative z-10 text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform duration-500 hover:rotate-12 ${
                  darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600'
                }`}>
                  <Trash2 size={32} />
                </div>
                
                <h3 className={`text-xl font-black tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Delete Last Imported JSON File?
                </h3>
                <p className={`text-xs mb-4 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {lastImportInfo?.count 
                    ? `Are you sure you want to permanently delete ALL ${lastImportInfo.count} rules from your most recent imported JSON file? Sabhi ${lastImportInfo.count} rules ek sath delete ho jayenge.`
                    : 'Are you sure you want to permanently delete all rules from your last imported JSON file at once?'}
                </p>

                {lastImportInfo?.importedAt && (
                  <div className={`mb-5 p-2.5 rounded-xl border text-[11px] text-left ${
                    darkMode ? 'bg-neutral-800/60 border-neutral-700/60 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-rose-500">Import Date:</span>
                      <span className="font-mono text-[10px]">{new Date(lastImportInfo.importedAt).toLocaleString()}</span>
                    </div>
                    {lastImportInfo?.count ? (
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-400">Total Rules in File:</span>
                        <span className="font-bold text-rose-400">{lastImportInfo.count} Rules</span>
                      </div>
                    ) : null}
                  </div>
                )}
                
                <div className="flex flex-col space-y-2.5">
                  <button
                    disabled={deletingLastImport}
                    onClick={handleDeleteLastImport}
                    className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider text-xs text-white bg-rose-600 hover:bg-rose-700 active:scale-98 disabled:opacity-50 shadow-lg shadow-rose-600/20 transition flex items-center justify-center space-x-2"
                  >
                    {deletingLastImport ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Deleting All Rules...</span>
                      </>
                    ) : (
                      <span>Delete Entire File ({lastImportInfo?.count || 'All'} Rules)</span>
                    )}
                  </button>
                  <button
                    disabled={deletingLastImport}
                    onClick={() => setShowDeleteLastKeywordConfirm(false)}
                    className={`w-full py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition ${
                      darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Last 1 Rule Confirmation Modal (Single Rule) */}
      <AnimatePresence>
        {showDeleteLastRuleConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              className={`w-full max-w-sm p-6 sm:p-7 rounded-[2rem] shadow-2xl border relative overflow-hidden ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-100'
              }`}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 bg-amber-500" />
              
              <div className="relative z-10 text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform duration-500 hover:rotate-12 ${
                  darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600'
                }`}>
                  <Trash2 size={32} />
                </div>
                
                <h3 className={`text-xl font-black tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Delete Last 1 Rule?
                </h3>
                <p className={`text-xs mb-4 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Are you sure you want to delete only the single most recently added or imported rule? (Sirf 1 aakhri rule delete hoga).
                </p>

                {lastImportInfo?.latestRuleName && (
                  <div className={`mb-5 p-2.5 rounded-xl border text-[11px] text-left ${
                    darkMode ? 'bg-neutral-800/60 border-neutral-700/60 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-amber-500">Target Rule:</span>
                      <span className="font-mono text-[11px] font-bold text-amber-400 truncate max-w-[170px]">
                        "{lastImportInfo.latestRuleName}"
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col space-y-2.5">
                  <button
                    disabled={deletingLastRule}
                    onClick={handleDeleteLastRule}
                    className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider text-xs text-white bg-amber-600 hover:bg-amber-700 active:scale-98 disabled:opacity-50 shadow-lg shadow-amber-600/20 transition flex items-center justify-center space-x-2"
                  >
                    {deletingLastRule ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Deleting Rule...</span>
                      </>
                    ) : (
                      <span>Delete Last 1 Rule</span>
                    )}
                  </button>
                  <button
                    disabled={deletingLastRule}
                    onClick={() => setShowDeleteLastRuleConfirm(false)}
                    className={`w-full py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition ${
                      darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Specific Imported Batch Confirmation Modal */}
      <AnimatePresence>
        {batchToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              className={`w-full max-w-sm p-6 sm:p-7 rounded-[2rem] shadow-2xl border relative overflow-hidden ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-100'
              }`}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 bg-rose-500" />
              
              <div className="relative z-10 text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform duration-500 hover:rotate-12 ${
                  darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600'
                }`}>
                  <Trash2 size={32} />
                </div>
                
                <h3 className={`text-xl font-black tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Delete Imported File Batch?
                </h3>
                <p className={`text-xs mb-4 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Are you sure you want to permanently delete <span className="font-bold text-white">"{batchToDelete.fileName}"</span> and all its {batchToDelete.count} rules?
                </p>

                <div className="flex flex-col space-y-2.5">
                  <button
                    disabled={deletingBatchId === batchToDelete.batchId}
                    onClick={() => handleDeleteImportBatch(batchToDelete.batchId)}
                    className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider text-xs text-white bg-rose-600 hover:bg-rose-700 active:scale-98 disabled:opacity-50 shadow-lg shadow-rose-600/20 transition flex items-center justify-center space-x-2"
                  >
                    {deletingBatchId === batchToDelete.batchId ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Deleting File...</span>
                      </>
                    ) : (
                      <span>Delete File & {batchToDelete.count} Rules</span>
                    )}
                  </button>
                  <button
                    disabled={deletingBatchId === batchToDelete.batchId}
                    onClick={() => setBatchToDelete(null)}
                    className={`w-full py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition ${
                      darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className={`w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl border relative overflow-hidden ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-100'
              }`}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 bg-rose-500" />
              
              <div className="relative z-10 text-center">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 transition-transform duration-500 hover:rotate-12 ${
                  darkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600'
                }`}>
                  <LogOut size={40} />
                </div>
                
                <h3 className={`text-2xl font-black tracking-tight mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Logout Session?
                </h3>
                <p className={`text-sm mb-8 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Are you sure you want to end your current session? You will need to sign in again to manage your bot.
                </p>
                
                <div className="flex flex-col space-y-3">
                  <button
                    onClick={handleLogout}
                    className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs text-white bg-rose-500 hover:bg-rose-600 shadow-xl shadow-rose-500/20 transition"
                  >
                    Yes, Logout Now
                  </button>
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition ${
                      darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Keywords Confirmation Modal */}
      <AnimatePresence>
        {showResetKeywordsConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className={`w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl border relative overflow-hidden ${
                darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-slate-100'
              }`}
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 bg-amber-500" />
              
              <div className="relative z-10 text-center">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 transition-transform duration-500 hover:rotate-12 ${
                  darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600'
                }`}>
                  <RotateCcw size={40} />
                </div>
                
                <h3 className={`text-2xl font-black tracking-tight mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Reset All Keywords?
                </h3>
                <p className={`text-sm mb-8 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  This will reset the reply counts for all keywords to zero immediately.
                </p>
                
                <div className="flex flex-col space-y-3">
                  <button
                    onClick={handleResetKeywords}
                    className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs text-white bg-amber-500 hover:bg-amber-600 shadow-xl shadow-amber-500/20 transition"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => setShowResetKeywordsConfirm(false)}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition ${
                      darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logo Selector Modal */}
      <LogoSelectorModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        currentLogo={appLogoInput || stats?.appLogo || ''}
        onSaveLogo={handleSaveLogo}
        darkMode={darkMode}
      />

      {/* Install App / WebAPK Download Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onTriggerInstall={handleInstallApp}
        darkMode={darkMode}
        appLogo={appLogoInput || stats?.appLogo}
      />
    </motion.div>
      )}
    </AnimatePresence>
  );
}

