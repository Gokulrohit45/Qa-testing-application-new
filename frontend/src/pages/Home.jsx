import React from 'react';
import { Zap, Monitor, Cpu, Terminal, Activity, Download, ShieldCheck } from 'lucide-react';

export default function Home() {

  const handleDownloadWindows = () => {
    const link = document.createElement('a');
    link.href = 'https://github.com/Gokulrohit45/Qa-testing-application-new/releases/download/v1.0.0/QA-AI-Platform-1.0.0-x64.zip';
    link.download = 'QA-AI-Platform-1.0.0-x64.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#06080f] text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden relative">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-1/4 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] left-10 w-[600px] h-[600px] bg-indigo-900/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Navbar */}
      <header className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-white/5 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 gradient-brand rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-white tracking-tight text-sm">QA·AI Platform</span>
            <p className="text-[10px] text-indigo-400 font-semibold tracking-wider uppercase leading-none mt-0.5">Autonomous Agent</p>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" /> Desktop App v2.0.0 Available Now
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-[1.1] max-w-4xl mx-auto">
          Autonomous E2E Testing <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400">
            Powered by Gemini AI
          </span>
        </h1>
        <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mt-6">
          Wipe out manual automation testing script creation. Input user stories in natural language, automatically translate them to Playwright actions, verification steps, biometric streams, and intercept trace diagnostics instantly.
        </p>

        {/* Hero CTA Download Options */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
          <button onClick={handleDownloadWindows} className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all flex items-center gap-2.5 shadow-lg shadow-indigo-600/35 hover:-translate-y-0.5">
            <Download size={15}/> Download for Windows (.zip)
          </button>
          <a href="https://github.com/Gokulrohit45/Qa-testing-application-new/releases/tag/v1.0.0" target="_blank" rel="noopener noreferrer" className="px-6 py-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-white text-xs font-black transition-all flex items-center gap-2.5 hover:-translate-y-0.5">
            <Monitor size={15} className="text-indigo-400"/> View All Releases
          </a>
        </div>
      </section>

      {/* Core Capabilities Showcase */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-white/5 relative z-10">
        <div className="text-center mb-16">
          <p className="text-[10px] text-indigo-400 font-bold tracking-widest uppercase mb-1.5">Capabilities</p>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Core Features Built for Next-Gen Teams</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="card p-6 space-y-4 hover:border-slate-700/80 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
              <Cpu size={18} />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">Gemini AI Translator</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Convert raw text, markdown scripts, or fuzzy-header Excel CSVs into robust executable Playwright automation steps instantly.
            </p>
          </div>

          {/* Card 2 */}
          <div className="card p-6 space-y-4 hover:border-slate-700/80 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
              <ShieldCheck size={18} />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-violet-400 transition-colors">Biometric Face Auth</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Supports virtual webcam video stream injection (Y4M formats) to easily bypass face recognition steps during end-to-end automation runs.
            </p>
          </div>

          {/* Card 3 */}
          <div className="card p-6 space-y-4 hover:border-slate-700/80 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <Terminal size={18} />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">Live Run Console</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Mac-styled CLI console block prints logs, duration stats, and caret cursors. Live audit list includes screen screenshots.
            </p>
          </div>

          {/* Card 4 */}
          <div className="card p-6 space-y-4 hover:border-slate-700/80 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 group-hover:scale-105 transition-transform">
              <Activity size={18} />
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-pink-400 transition-colors">OTel AI Observability</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Traces backend microservice API calls and database query latency. Generates element selector recommendations when steps fail.
            </p>
          </div>
        </div>
      </section>

      {/* System Specifications Section */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-white/5 relative z-10 bg-slate-950/20 rounded-3xl mb-20 border border-white/5">
        <h2 className="text-xl font-bold text-white text-center mb-8">System Requirements &amp; Platform Support</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center text-xs">
          <div className="space-y-2 p-4">
            <div className="text-indigo-400 font-bold">🖥️ Windows Client</div>
            <p className="text-slate-400">Windows 10, 11 (64-bit)</p>
            <p className="text-slate-500 text-[10px]">Setup format: .exe, .msi installer</p>
          </div>
          <div className="space-y-2 p-4 border-y md:border-y-0 md:border-x border-white/5">
            <div className="text-indigo-400 font-bold">🍏 macOS Client</div>
            <p className="text-slate-400">Intel &amp; Apple Silicon (M1/M2/M3)</p>
            <p className="text-slate-500 text-[10px]">Setup format: .dmg package</p>
          </div>
          <div className="space-y-2 p-4">
            <div className="text-indigo-400 font-bold">🐧 Linux Client</div>
            <p className="text-slate-400">Ubuntu 20.04+, Debian, Fedora</p>
            <p className="text-slate-500 text-[10px]">Setup format: .deb, .tar.gz bundle</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} QA-AI Autonomous Testing Platform. All rights reserved. Securely powered by Supabase.
          </p>
          <div className="flex gap-6 text-[11px] text-slate-400">
            <a href="#download" className="hover:text-white transition-colors">Download Center</a>
            <a href="#specs" className="hover:text-white transition-colors">System Specs</a>
            <span className="text-indigo-400 font-bold">🔐 256-bit SSL Connection</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
