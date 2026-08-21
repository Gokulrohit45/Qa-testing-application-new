import React, { useState } from 'react';
import { Save, ToggleLeft, ToggleRight, CheckCircle2 } from 'lucide-react';

export default function Settings() {
  const [settings, setSettings] = useState({ defaultTimeout:30, headless:true, concurrencyLimit:3, slackWebhook:'', discordWebhook:'' });
  const [saved, setSaved] = useState(false);
  const handleSave = (e) => { e.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 3000); };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-primary tracking-tight">Settings</h1>
        <p className="text-secondary text-sm mt-1">Configure system defaults for Playwright execution and integrations.</p>
      </div>

      <form onSubmit={handleSave} className="card overflow-hidden">
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="section-label">Playwright Runner</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label:'Default Timeout (s)', key:'defaultTimeout', type:'number' },
                { label:'Concurrency Limit',   key:'concurrencyLimit', type:'number' },
              ].map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="section-label">{f.label}</label>
                  <input type={f.type} value={settings[f.key]} onChange={e => setSettings({...settings,[f.key]:parseInt(e.target.value)})}
                    className="input-field"/>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between py-3 border-t border-slate-100/50 dark:border-zinc-800/30">
              <div>
                <p className="text-xs font-semibold text-primary">Default Headless Mode</p>
                <p className="text-[11px] text-secondary mt-0.5">Run browsers without a visible GUI window by default.</p>
              </div>
              <button type="button" onClick={() => setSettings({...settings, headless:!settings.headless})}>
                {settings.headless
                  ? <ToggleRight size={36} className="text-indigo-600 dark:text-indigo-500 cursor-pointer"/>
                  : <ToggleLeft  size={36} className="text-slate-300  dark:text-zinc-700    cursor-pointer"/>}
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-100/50 dark:border-zinc-800/30">
            <h2 className="section-label">Integrations &amp; Webhooks</h2>
            {[
              { label:'Slack Webhook URL',   key:'slackWebhook',   placeholder:'https://hooks.slack.com/services/...' },
              { label:'Discord Webhook URL', key:'discordWebhook', placeholder:'https://discord.com/api/webhooks/...' },
            ].map(f => (
              <div key={f.key} className="space-y-1.5">
                <label className="section-label">{f.label}</label>
                <input type="text" value={settings[f.key]} onChange={e => setSettings({...settings,[f.key]:e.target.value})}
                  placeholder={f.placeholder} className="input-field"/>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-900/50 border-t border-slate-100/50 dark:border-zinc-800/30 flex items-center justify-between">
          {saved && (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={14}/> Settings saved
            </div>
          )}
          <button type="submit" className="btn-primary ml-auto"><Save size={15}/> Save Settings</button>
        </div>
      </form>
    </div>
  );
}
