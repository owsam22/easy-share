
import { Share2, Loader2 } from 'lucide-react';

export default function Header({ connected }: { connected: boolean }) {
  return (
    <header className="w-full max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Share2 size={24} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
          Easy Share
        </h1>
      </div>

      <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-wider transition-all duration-500 ${connected ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
        {connected ? (
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        ) : (
          <Loader2 size={12} className="animate-spin" />
        )}
        <span>{connected ? 'Device Linked' : 'Connecting to Server...'}</span>
      </div>
    </header>
  );
}
