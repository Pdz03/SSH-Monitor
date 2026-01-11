import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Settings, Play, Square, Trash2, Search, Activity, Save, RotateCcw, RotateCw, PlayCircle, StopCircle } from 'lucide-react';
import { io } from 'socket.io-client';

// Deteksi otomatis URL backend: 
// Jika jalan di dev (localhost), pakai port 3001. Jika di prod, pakai origin yang sama.
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;

const socket = io(SOCKET_URL, {
  transports: ['websocket']
});

const App = () => {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('disconnected');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // 'start', 'stop', 'restart'
  
  // Inisialisasi config dari localStorage jika ada
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('ssh_monitor_config');
    return saved ? JSON.parse(saved) : {
      host: '', 
      username: '', 
      password: '', 
      sudoPassword: '', 
      processName: '', 
      useSudo: true
    };
  });

  const logEndRef = useRef(null);

  // Load log dari socket
  useEffect(() => {
    const handleLog = (data) => {
      const lines = data.split('\n');
      const newLogs = lines
        .filter(line => line.trim() !== '' && !line.includes('[sudo] password'))
        .map(line => ({
          id: Math.random() + Date.now(),
          content: line,
          isQR: /[\u2580-\u259F]/.test(line) 
        }));
      
      if (newLogs.length > 0) {
        setLogs(prev => [...prev.slice(-1000), ...newLogs]);
      }
    };

    socket.on('log', handleLog);
    return () => socket.off('log', handleLog);
  }, []);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll) logEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [logs, autoScroll]);

  const saveToLocal = (data) => {
    localStorage.setItem('ssh_monitor_config', JSON.stringify(data));
  };

  const handleConnect = () => {
    saveToLocal(config);
    setLogs([]);
    setStatus('connecting');
    socket.emit('start-ssh', config);
    setStatus('connected');
  };

  const handlePM2Action = (action) => {
    if (status !== 'connected') return;
    
    setActionLoading(action);
    // Kirim perintah aksi ke backend
    socket.emit('pm2-action', { ...config, action });
    
    // Tambahkan log manual untuk info
    const actionNames = { restart: 'RESTARTING', stop: 'STOPPING', start: 'STARTING' };
    const newLog = {
      id: Date.now(),
      content: `>>> Dashboard: Mengirim perintah ${actionNames[action]} untuk [${config.processName || 'ALL'}]...`,
      isQR: false
    };
    setLogs(prev => [...prev, newLog]);

    // Reset loading setelah 2 detik
    setTimeout(() => setActionLoading(null), 2000);
  };

  const clearSavedConfig = () => {
    localStorage.removeItem('ssh_monitor_config');
    setConfig({
      host: '', username: '', password: '', sudoPassword: '', processName: '', useSudo: true
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 rounded-xl">
              <Activity className="text-indigo-400 w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">PM2 Multi-Server Monitor</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${status === 'connected' ? 'text-green-500' : 'text-slate-500'}`}>{status}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {status === 'disconnected' ? (
              <button onClick={handleConnect} className="bg-indigo-600 px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-900/20 flex items-center gap-2 text-sm">
                <Play size={18} fill="currentColor" /> Start Monitoring
              </button>
            ) : (
              <button onClick={() => window.location.reload()} className="bg-red-600/20 text-red-400 border border-red-600/50 px-6 py-2.5 rounded-xl font-bold hover:bg-red-600/30 transition-all flex items-center gap-2 text-sm">
                <Square size={18} fill="currentColor" /> Stop & Reset
              </button>
            )}
            <button onClick={() => setLogs([])} className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-slate-400 transition-all" title="Clear Screen">
              <Trash2 size={20}/>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Sidebar Config */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Form Config */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Settings size={18} />
                  <h2 className="font-bold uppercase tracking-widest text-[10px]">Konfigurasi</h2>
                </div>
                <button onClick={clearSavedConfig} className="text-slate-500 hover:text-red-400 transition-colors" title="Reset Form">
                  <RotateCcw size={14} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 mb-1 block">Server IP</label>
                  <input type="text" placeholder="103.x.x.x" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-indigo-500 outline-none transition-all" value={config.host} onChange={e => setConfig({...config, host: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 mb-1 block">Username</label>
                  <input type="text" placeholder="root" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-indigo-500 outline-none transition-all" value={config.username} onChange={e => setConfig({...config, username: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 mb-1 block">SSH Password</label>
                  <input type="password" placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-indigo-500 outline-none transition-all" value={config.password} onChange={e => setConfig({...config, password: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 mb-1 block">PM2 Process Name</label>
                  <input type="text" placeholder="wa-bot-1" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-indigo-300 font-mono focus:border-indigo-500 outline-none transition-all" value={config.processName} onChange={e => setConfig({...config, processName: e.target.value})} />
                </div>
                
                <div className="pt-4 border-t border-slate-800 space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Use Sudo</span>
                    <input type="checkbox" className="w-4 h-4 accent-indigo-500" checked={config.useSudo} onChange={e => setConfig({...config, useSudo: e.target.checked})} />
                  </div>
                  {config.useSudo && (
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1 mb-1 block">Sudo Password</label>
                      <input type="password" placeholder="••••••••" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-indigo-500 outline-none transition-all" value={config.sudoPassword} onChange={e => setConfig({...config, sudoPassword: e.target.value})} />
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => { saveToLocal(config); alert('Konfigurasi disimpan!'); }}
                  className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700 tracking-wider"
                >
                  <Save size={14} /> Simpan Form
                </button>
              </div>
            </div>

            {/* PM2 Remote Controls */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
              <div className="flex items-center gap-2 text-emerald-400 mb-6 border-b border-slate-800 pb-4">
                <Terminal size={18} />
                <h2 className="font-bold uppercase tracking-widest text-[10px]">Remote Control</h2>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  disabled={status !== 'connected' || actionLoading}
                  onClick={() => handlePM2Action('restart')}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                    status === 'connected' 
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20' 
                    : 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RotateCw size={16} className={actionLoading === 'restart' ? 'animate-spin' : ''} />
                    Restart Process
                  </div>
                </button>

                <button 
                  disabled={status !== 'connected' || actionLoading}
                  onClick={() => handlePM2Action('stop')}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                    status === 'connected' 
                    ? 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20' 
                    : 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StopCircle size={16} />
                    Stop Process
                  </div>
                </button>

                <button 
                  disabled={status !== 'connected' || actionLoading}
                  onClick={() => handlePM2Action('start')}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl font-bold text-xs transition-all border ${
                    status === 'connected' 
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20' 
                    : 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <PlayCircle size={16} />
                    Start Process
                  </div>
                </button>
              </div>
              <p className="mt-4 text-[9px] text-slate-500 italic text-center uppercase tracking-tighter">
                Aksi akan diterapkan pada: {config.processName || 'Semua Proses'}
              </p>
            </div>
            
          </div>

          {/* Log Area */}
          <div className="lg:col-span-9 flex flex-col h-[800px] bg-black rounded-2xl border border-slate-800 overflow-hidden shadow-2xl relative">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                  <input type="text" placeholder="Filter log..." className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1 text-sm w-64 focus:border-indigo-500 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="accent-indigo-500" /> Auto-scroll
                </label>
            </div>

            <div className="flex-1 overflow-y-auto p-5 font-mono text-[12px] leading-[1.1] selection:bg-indigo-500/30">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-800 space-y-4">
                  <Terminal size={48} strokeWidth={1} />
                  <p className="text-sm italic font-sans">Ready to stream logs...</p>
                </div>
              ) : (
                logs.filter(l => l.content.toLowerCase().includes(searchTerm.toLowerCase())).map((log) => (
                  <div 
                    key={log.id} 
                    className={`whitespace-pre tracking-tighter transition-colors ${log.isQR ? 'text-white leading-[1.2] py-0' : 'text-slate-300 py-0.5 hover:bg-slate-900/50'}`}
                  >
                    {log.content}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>

            <div className="absolute bottom-4 right-6 pointer-events-none">
              <div className="px-3 py-1 bg-indigo-600 rounded-full text-[10px] font-black text-white shadow-lg animate-pulse">
                LIVE
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;