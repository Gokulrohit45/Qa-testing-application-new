import React, { useState } from 'react';
import { Save, ToggleLeft, ToggleRight, CheckCircle2, Sliders, Webhook } from 'lucide-react';

export default function Settings() {
  const [settings, setSettings] = useState({
    defaultTimeout: 30,
    headless: true,
    concurrencyLimit: 3,
    slackWebhook: '',
    discordWebhook: ''
  });
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    localStorage.setItem('qa_platform_settings', JSON.stringify(settings));
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure system defaults for Playwright execution driver and webhooks integrations.
        </p>
      </div>

      <form onSubmit={handleSave} className="glass-card rounded-2xl p-8 border border-slate-800 space-y-6">
        {/* Playwright Section */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-dark-border pb-3">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Playwright Runner</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Default Timeout (Seconds)
              </label>
              <input
                type="number"
                value={settings.defaultTimeout}
                onChange={e => setSettings({ ...settings, defaultTimeout: parseInt(e.target.value) || 30 })}
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Concurrency Limit
              </label>
              <input
                type="number"
                value={settings.concurrencyLimit}
                onChange={e => setSettings({ ...settings, concurrencyLimit: parseInt(e.target.value) || 1 })}
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-dark-border/60">
            <div>
              <p className="text-xs font-bold text-white">Default Headless Mode</p>
              <p className="text-[11px] text-slate-400">Run browsers without a visible GUI window by default.</p>
            </div>
            <button
              type="button"
              onClick={() => setSettings({ ...settings, headless: !settings.headless })}
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {settings.headless ? (
                <ToggleRight className="w-8 h-8 text-indigo-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-slate-600" />
              )}
            </button>
          </div>
        </div>

        {/* Webhooks Section */}
        <div className="space-y-4 pt-2 border-t border-dark-border">
          <div className="flex items-center space-x-2 border-b border-dark-border pb-3">
            <Webhook className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Integrations & Webhooks</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Slack Webhook URL
              </label>
              <input
                type="text"
                value={settings.slackWebhook}
                onChange={e => setSettings({ ...settings, slackWebhook: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-2.5 text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Discord Webhook URL
              </label>
              <input
                type="text"
                value={settings.discordWebhook}
                onChange={e => setSettings({ ...settings, discordWebhook: e.target.value })}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-2.5 text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 flex items-center justify-between border-t border-dark-border">
          {saved ? (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Settings saved successfully
            </div>
          ) : <div />}

          <button
            type="submit"
            className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/25 flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
