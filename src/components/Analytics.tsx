import React, { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  TrendingUp, 
  Layers, 
  FileText,
  Clock
} from 'lucide-react';
import { 
  AreaChart,
  Area,
  CartesianGrid,
  Tooltip, 
  ResponsiveContainer, 
  XAxis, 
  YAxis 
} from 'recharts';

interface AnalyticsProps {
  darkMode: boolean;
  direction: number;
  slideVariants: any;
}

const Analytics: React.FC<AnalyticsProps> = ({
  darkMode,
  direction,
  slideVariants,
}) => {
  const [duration, setDuration] = useState<'last7' | 'last15' | 'last30' | 'single' | 'custom'>('last7');
  
  // Calculate default dates for YYYY-MM-DD
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getStartDateOfOption = (opt: 'last7' | 'last15' | 'last30') => {
    const d = new Date();
    if (opt === 'last7') d.setDate(d.getDate() - 6);
    else if (opt === 'last15') d.setDate(d.getDate() - 14);
    else if (opt === 'last30') d.setDate(d.getDate() - 29);
    return formatDate(d);
  };

  const [startDateStr, setStartDateStr] = useState(getStartDateOfOption('last7'));
  const [endDateStr, setEndDateStr] = useState(formatDate(new Date()));
  const [singleDateStr, setSingleDateStr] = useState(formatDate(new Date()));
  const [loading, setLoading] = useState(false);
  
  const [data, setData] = useState<{
    keywordData: any[];
    topicData: any[];
    topicCreationData: any[];
  }>({
    keywordData: [],
    topicData: [],
    topicCreationData: []
  });

  // Fetch from /api/analytics
  const fetchAnalyticsData = async (start: string, end: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: start,
        endDate: end,
        timezone: "Asia/Kolkata"
      });
      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setData({
          keywordData: result.keywordData || [],
          topicData: result.topicData || [],
          topicCreationData: result.topicCreationData || []
        });
      }
    } catch (error) {
      console.error("Error fetching analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Trigger fetch when parameters change
  useEffect(() => {
    if (duration !== 'custom' && duration !== 'single') {
      const calculatedStart = getStartDateOfOption(duration);
      const calculatedEnd = formatDate(new Date());
      setStartDateStr(calculatedStart);
      setEndDateStr(calculatedEnd);
      fetchAnalyticsData(calculatedStart, calculatedEnd);
    } else if (duration === 'single') {
      setStartDateStr(singleDateStr);
      setEndDateStr(singleDateStr);
      fetchAnalyticsData(singleDateStr, singleDateStr);
    } else {
      fetchAnalyticsData(startDateStr, endDateStr);
    }
  }, [duration, singleDateStr]);

  const handleCustomSearch = () => {
    if (duration === 'custom') {
      fetchAnalyticsData(startDateStr, endDateStr);
    }
  };

  // Stats calculation
  const totalCreatedTopics = data.topicCreationData.reduce((acc, curr) => acc + curr.count, 0);
  const maxCreatedInADay = data.topicCreationData.reduce((max, curr) => curr.count > max ? curr.count : max, 0);
  const averageCreatedPerDay = data.topicCreationData.length > 0 
    ? (totalCreatedTopics / data.topicCreationData.length).toFixed(1) 
    : '0';

  return (
    <motion.div
      key="analytics"
      custom={direction}
      variants={slideVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6 w-full"
    >
      {/* Date Filters Controls */}
      <div className={`p-6 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden ${darkMode ? 'bg-neutral-900 border-white/5 shadow-2xl' : 'bg-white border-slate-100 shadow-xl shadow-slate-100/5'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className={`text-lg font-black uppercase tracking-wider ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Analytics Dashboard
            </h2>
            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Monitor topic creation patterns and custom date statistics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Presets */}
            <div className={`flex flex-wrap p-1 rounded-2xl border ${darkMode ? 'bg-black/40 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
              {(['last7', 'last15', 'last30', 'single', 'custom'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setDuration(opt)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                    duration === opt 
                      ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                      : (darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900')
                  }`}
                >
                  {opt === 'last7' ? '7 Days' : opt === 'last15' ? '15 Days' : opt === 'last30' ? '30 Days' : opt === 'single' ? 'Particular Date' : 'Custom Range'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Particular Date Selector */}
        <AnimatePresence>
          {duration === 'single' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className={`mt-5 pt-5 border-t flex flex-col sm:flex-row sm:items-end gap-4 ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                <div className="space-y-1.5 flex-1 max-w-sm">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    Select particular date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={singleDateStr}
                      onChange={(e) => setSingleDateStr(e.target.value)}
                      className={`w-full p-3 pl-10 border rounded-xl outline-none text-xs transition ${
                        darkMode 
                          ? 'bg-black border-white/5 text-white focus:ring-1 focus:ring-cyan-500' 
                          : 'bg-slate-50 border-slate-200 text-slate-850 focus:ring-1 focus:ring-cyan-500'
                      }`}
                    />
                    <Calendar size={14} className="absolute left-3.5 top-3.5 text-slate-450" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Range Selector */}
        <AnimatePresence>
          {duration === 'custom' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className={`mt-5 pt-5 border-t flex flex-col sm:flex-row sm:items-end gap-4 ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                <div className="space-y-1.5 flex-1">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    Start Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(e) => setStartDateStr(e.target.value)}
                      className={`w-full p-3 pl-10 border rounded-xl outline-none text-xs transition ${
                        darkMode 
                          ? 'bg-black border-white/5 text-white focus:ring-1 focus:ring-cyan-500' 
                          : 'bg-slate-50 border-slate-200 text-slate-850 focus:ring-1 focus:ring-cyan-500'
                      }`}
                    />
                    <Calendar size={14} className="absolute left-3.5 top-3.5 text-slate-450" />
                  </div>
                </div>

                <div className="space-y-1.5 flex-1">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    End Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={endDateStr}
                      onChange={(e) => setEndDateStr(e.target.value)}
                      className={`w-full p-3 pl-10 border rounded-xl outline-none text-xs transition ${
                        darkMode 
                          ? 'bg-black border-white/5 text-white focus:ring-1 focus:ring-cyan-500' 
                          : 'bg-slate-50 border-slate-200 text-slate-850 focus:ring-1 focus:ring-cyan-500'
                      }`}
                    />
                    <Calendar size={14} className="absolute left-3.5 top-3.5 text-slate-450" />
                  </div>
                </div>

                <button
                  onClick={handleCustomSearch}
                  className={`py-3.5 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-lg ${
                    darkMode 
                      ? 'bg-cyan-500 text-black hover:bg-cyan-400 shadow-cyan-900/10' 
                      : 'bg-cyan-600 text-white hover:bg-cyan-700 shadow-cyan-600/10'
                  }`}
                >
                  Apply Filter
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Indicators Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`p-6 border rounded-[2.5rem] relative overflow-hidden transition-all duration-500 ${darkMode ? 'bg-cyan-950/20 border-cyan-500/10 glow-cyan' : 'bg-cyan-50/50 border-cyan-200/50 shadow-lg shadow-cyan-500/5'}`}>
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <span className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>Total Topics Created</span>
              <h3 className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{totalCreatedTopics}</h3>
            </div>
            <div className={`p-3 rounded-2xl ${darkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-500/10 text-cyan-600'}`}>
              <Layers size={18} />
            </div>
          </div>
        </div>

        <div className={`p-6 border rounded-[2.5rem] relative overflow-hidden transition-all duration-500 ${darkMode ? 'bg-violet-950/20 border-violet-500/10 glow-violet' : 'bg-violet-50/50 border-violet-200/50 shadow-lg shadow-violet-500/5'}`}>
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <span className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-violet-400' : 'text-violet-600'}`}>Peak Daily Creations</span>
              <h3 className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{maxCreatedInADay} <span className="text-xs font-normal opacity-50">topics/day</span></h3>
            </div>
            <div className={`p-3 rounded-2xl ${darkMode ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-500/10 text-violet-600'}`}>
              <TrendingUp size={18} />
            </div>
          </div>
        </div>

        <div className={`p-6 border rounded-[2.5rem] relative overflow-hidden transition-all duration-500 ${darkMode ? 'bg-emerald-950/20 border-emerald-500/10 glow-emerald' : 'bg-emerald-50/50 border-emerald-200/50 shadow-lg shadow-emerald-500/5'}`}>
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <span className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Daily Creation Average</span>
              <h3 className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{averageCreatedPerDay} <span className="text-xs font-normal opacity-50">topics/avg</span></h3>
            </div>
            <div className={`p-3 rounded-2xl ${darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-500/10 text-emerald-600'}`}>
              <Clock size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Daily Topic Creations Chart */}
      <div className={`border p-6 rounded-[2.5rem] space-y-6 transition-colors duration-500 glow-cyan relative overflow-hidden group ${darkMode ? 'bg-cyan-950/30 border-cyan-500/20' : 'bg-cyan-50/30 border-cyan-200 shadow-xl shadow-cyan-500/5'}`}>
        <div className={`absolute inset-0 pattern-dots opacity-[0.03] pointer-events-none ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
        <div className="relative z-10 space-y-6 pointer-events-auto">
          <div className="flex items-center space-x-2">
            <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-500/10 text-cyan-600'}`}>
              <TrendingUp size={14} />
            </div>
            <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>Topic Creations Timeline</h3>
          </div>

          <div className="h-64 w-full">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-3">
                <div className="w-8 h-8 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin" />
                <span className="text-xs text-slate-400 font-medium">Computing aggregation statistics...</span>
              </div>
            ) : data.topicCreationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.topicCreationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCreation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 9, fill: darkMode ? '#9ca3af' : '#6b7280' }}
                    tickFormatter={(date) => {
                      try {
                        const parts = date.split('-');
                        if (parts.length === 3) {
                          return `${parts[2]}/${parts[1]}`; // DD/MM format
                        }
                      } catch {}
                      return date;
                    }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: darkMode ? '#9ca3af' : '#6b7280' }} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: darkMode ? '#171717' : '#ffffff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                    labelStyle={{ color: darkMode ? '#cbd5e1' : '#1e293b', fontSize: '11px', fontWeight: 'bold' }}
                    itemStyle={{ color: darkMode ? '#e5e5e5' : '#171717' }}
                  />
                  <Area type="monotone" dataKey="count" name="Topics Created" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCreation)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full opacity-50 text-sm">No data available for the selected period</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Topic Hits Distribution */}
        <div className={`border p-6 rounded-[2.5rem] space-y-6 transition-colors duration-500 relative overflow-hidden group ${darkMode ? 'bg-cyan-950/20 border-cyan-500/10 glow-cyan' : 'bg-white border-slate-100 shadow-xl shadow-slate-100/5'}`}>
          <div className="flex items-center space-x-2">
            <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-500/10 text-cyan-600'}`}>
              <Layers size={14} />
            </div>
            <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>Topic Hit Distribution</h3>
          </div>

          <div className="space-y-4">
            {data.topicData.length > 0 ? (
              data.topicData.map((topic, i) => {
                const maxVal = Math.max(...data.topicData.map(t => t.value), 1);
                const percent = Math.round((topic.value / maxVal) * 100);
                return (
                  <div key={topic.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>{topic.name}</span>
                      <span className="text-cyan-500">{topic.value} hits</span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-neutral-800' : 'bg-slate-100'}`}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-center py-6 opacity-50">No topic hit logs recorded yet. Match bots to topics to see statistics.</div>
            )}
          </div>
        </div>

        {/* Keyword Trigger Frequency */}
        <div className={`border p-6 rounded-[2.5rem] space-y-6 transition-colors duration-500 relative overflow-hidden group ${darkMode ? 'bg-violet-950/20 border-violet-500/10 glow-violet' : 'bg-white border-slate-100 shadow-xl shadow-slate-100/5'}`}>
          <div className="flex items-center space-x-2">
            <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-violet-500/20 text-violet-400' : 'bg-violet-500/10 text-violet-600'}`}>
              <TrendingUp size={14} />
            </div>
            <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-violet-400' : 'text-violet-600'}`}>Keyword Trigger Frequency</h3>
          </div>

          <div className="space-y-4">
            {data.keywordData.length > 0 ? (
              data.keywordData.map((kw, i) => {
                const maxVal = Math.max(...data.keywordData.map(k => k.value), 1);
                const percent = Math.round((kw.value / maxVal) * 100);
                return (
                  <div key={kw.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono ${darkMode ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20' : 'bg-violet-50 text-violet-600 border border-violet-200'}`}>
                        "{kw.name}"
                      </span>
                      <span className="text-violet-500">{kw.value} triggers</span>
                    </div>
                    <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-neutral-800' : 'bg-slate-100'}`}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-center py-6 opacity-50">No keyword triggers logged yet. Match rules to see metrics.</div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Breakdown List */}
      <div className={`border p-6 rounded-[2.5rem] relative overflow-hidden transition-all duration-500 ${darkMode ? 'bg-neutral-900 border-white/5' : 'bg-white border-slate-100 shadow-lg shadow-slate-100/5'}`}>
        <div className="flex items-center space-x-2 mb-6">
          <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-slate-500/20 text-slate-400' : 'bg-slate-500/10 text-slate-600'}`}>
            <FileText size={14} />
          </div>
          <h3 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Daily Creation Breakdown</h3>
        </div>

        <div className="max-h-60 overflow-y-auto pr-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`border-b text-[9px] font-black uppercase tracking-wider ${darkMode ? 'border-white/5 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Topics Created</th>
              </tr>
            </thead>
            <tbody>
              {data.topicCreationData.slice().reverse().map((row) => (
                <tr 
                  key={row.date} 
                  className={`border-b text-xs transition duration-200 ${
                    darkMode 
                      ? 'border-white/5 hover:bg-white/[0.02] text-slate-300' 
                      : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <td className="py-3 px-4 font-bold">{row.date}</td>
                  <td className="py-3 px-4 text-right font-black text-cyan-500">{row.count}</td>
                </tr>
              ))}
              {data.topicCreationData.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-8 text-center text-xs opacity-50">No creation records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export default memo(Analytics);
