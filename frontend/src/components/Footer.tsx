
import { Github, Twitter, Linkedin, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full max-w-5xl mx-auto px-6 py-12 mt-auto border-t border-slate-100">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="text-center md:text-left space-y-2">
          <h4 className="text-lg font-black text-slate-800">Easy Share</h4>
          <p className="text-slate-500 text-sm font-medium">Fast & temporary text sharing between devices.</p>
        </div>

        <div className="flex flex-col items-center md:items-end gap-3">
          <div className="flex gap-4">
             <a href="https://github.com/owsam22" target="_blank" className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
               <Github size={20} className="text-slate-600" />
             </a>
             <a href="#" className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
               <Twitter size={20} className="text-slate-600" />
             </a>
          </div>
          <p className="text-slate-400 text-sm font-bold flex items-center gap-1.5">
            Built with <Heart size={14} className="text-pink-500 fill-pink-500" /> by <a href="https://github.com/owsam22" target="_blank" className="text-blue-500 hover:underline">owsam22</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
