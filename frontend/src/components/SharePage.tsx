import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Share2, Copy, Check, RefreshCw, 
  Zap, Send, Info, Bell, Clock 
} from 'lucide-react';
import { socket } from '../lib/socket';
import Header from './Header';
import Footer from './Footer';

export default function SharePage() {
  const { roomId } = useParams();
  const [isConnected, setIsConnected] = useState(false);
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null);
  const [userCount, setUserCount] = useState<number>(0);
  const [text, setText] = useState<string>('');
  const [receivedText, setReceivedText] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' | 'role' } | null>(null);
  const [copied, setCopied] = useState(false);


  const socketRef = useRef(socket);

  const shareUrl = useMemo(() => {
    return `${window.location.origin}/?room=${roomId}`;
  }, [roomId]);



  useEffect(() => {
    if (!roomId) return;
    socketRef.current.connect();
    
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      socketRef.current.emit('join-room', roomId);
    });

    socketRef.current.on('disconnect', () => setIsConnected(false));

    socketRef.current.on('room-status', (data) => {
      setUserCount(data.userCount);
      const me = data.users.find((u: any) => u.id === socketRef.current.id);
      if (me) setRole(me.role);
      setReceivedText(data.text || '');
      setExpiresAt(data.expiresAt);
    });

    socketRef.current.on('text-updated', (data) => {
      setReceivedText(data.text);
      setExpiresAt(data.expiresAt);
      if (data.text && role === 'receiver') {
        const msg = 'New message received!';
        setNotification({ message: msg, type: 'info' });
      }
    });

    socketRef.current.on('role-swapped', (users) => {
      const me = users.find((u: any) => u.id === socketRef.current.id);
      if (me) {
        setRole(me.role);
        setNotification({ 
          message: `You are now the ${me.role === 'sender' ? 'Sender' : 'Receiver'}`, 
          type: 'role' 
        });
      }
    });

    socketRef.current.on('notification', (msg) => {
      setNotification({ message: msg, type: 'info' });
    });

    socketRef.current.on('error', (msg) => {
      setNotification({ message: `Error: ${msg}`, type: 'error' });
    });

    return () => {
      socketRef.current.off('connect');
      socketRef.current.off('disconnect');
      socketRef.current.off('room-status');
      socketRef.current.off('text-updated');
      socketRef.current.off('role-swapped');
      socketRef.current.off('notification');
      socketRef.current.off('error');
      socketRef.current.disconnect();
    };
  }, [roomId, role]);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(0);
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      const difference = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(difference);
      if (difference === 0) {
        setReceivedText('');
        setExpiresAt(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSend = () => {
    if (text.trim() && isConnected) {
      socketRef.current.emit('send-text', text);
      setText('');
      setNotification({ message: 'Text sent!', type: 'success' });
    }
  };

  const switchRole = () => {
    if (isConnected) socketRef.current.emit('switch-role');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(receivedText);
    setCopied(true);
    setNotification({ message: 'Text copied to clipboard!', type: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareRoom = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Easy Share',
          text: 'Join my Easy Share room to exchange text instantly!',
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      setNotification({ message: 'Link copied!', type: 'success' });
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col font-sans selection:bg-blue-500/30">
      <Header connected={isConnected} />

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-10 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center">
             {!isConnected ? (
                <div className="text-center space-y-6">
                   <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
                   <p className="text-slate-400 font-bold tracking-widest uppercase text-sm">Connecting to secure room...</p>
                </div>
             ) : userCount < 2 ? (
                <div className="text-center space-y-8 animate-in fade-in zoom-in duration-700">
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-20 animate-pulse" />
                      <div className="w-24 h-24 bg-slate-800 rounded-[2rem] flex items-center justify-center relative border border-slate-700">
                        <Share2 size={40} className="text-blue-500" />
                      </div>
                    </div>
                    <div className="space-y-3">
                       <h2 className="text-3xl font-black tracking-tight">Waiting for partner...</h2>
                       <p className="text-slate-400 max-w-xs mx-auto font-medium">
                          Share this room URL with someone to start instant text sharing.
                       </p>
                    </div>
                    <div className="flex gap-2 max-w-sm mx-auto w-full">
                       <div className="flex-1 bg-slate-800/50 p-2 rounded-2xl border border-slate-700 flex items-center gap-4 min-w-0">
                          <code className="flex-1 text-[10px] text-blue-400 px-2 font-mono truncate">{shareUrl}</code>
                          <button 
                           onClick={() => {
                             navigator.clipboard.writeText(shareUrl);
                             setNotification({ message: 'Link copied!', type: 'success' });
                           }}
                           className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all active:scale-95 shrink-0"
                           title="Copy Link"
                          >
                             <Copy size={14} />
                          </button>
                       </div>
                       <button 
                        onClick={handleShareRoom}
                        className="p-4 bg-blue-500 hover:bg-blue-600 rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-500/20 shrink-0"
                        title="Share Room"
                       >
                          <Share2 size={20} />
                       </button>
                    </div>
                </div>
             ) : (
                <div className="w-full space-y-8">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                         <div className={`px-4 py-1.5 rounded-full font-black text-xs uppercase tracking-widest ${role === 'sender' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}`}>
                            {role}
                         </div>
                         {expiresAt && (
                            <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-tighter">
                               <Clock size={14} />
                               Expires in {timeLeft}s
                            </div>
                         )}
                      </div>
                      <button 
                        onClick={switchRole}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 active:scale-95"
                      >
                         <RefreshCw size={16} />
                         <span className="text-xs font-bold uppercase tracking-wider">Switch Role</span>
                      </button>
                   </div>

                   <AnimatePresence mode="wait">
                      {role === 'sender' ? (
                        <motion.div
                          key="sender"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="space-y-6"
                        >
                           <div className="relative group">
                              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-[2.2rem] blur opacity-20 group-focus-within:opacity-40 transition-opacity" />
                              <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Type something to send..."
                                className="relative w-full h-64 p-8 bg-slate-900 rounded-[2rem] border border-slate-800 text-2xl font-medium outline-none placeholder:text-slate-700 focus:border-blue-500/50 transition-all resize-none shadow-2xl"
                              />
                           </div>
                           <button
                             onClick={handleSend}
                             disabled={!text.trim()}
                             className="w-full py-6 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 rounded-[2rem] font-black text-2xl shadow-2xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                           >
                              Send Text
                               <Send size={24} />
                           </button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="receiver"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="space-y-6"
                        >
                           <div className={`relative min-h-[16rem] p-10 rounded-[2.5rem] flex items-center justify-center text-center transition-all overflow-hidden ${receivedText ? 'bg-slate-900' : 'bg-slate-900/50 border-2 border-dashed border-slate-800'}`}>
                              {receivedText ? (
                                <>
                                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                                  <p className="text-3xl md:text-4xl font-black text-white break-words leading-tight">{receivedText}</p>
                                </>
                              ) : (
                                <div className="space-y-4 opacity-20">
                                   <Zap size={60} className="mx-auto text-slate-400 animate-pulse" />
                                   <p className="font-black text-sm tracking-[0.3em] uppercase">Listening for Sync</p>
                                </div>
                              )}
                           </div>
                           <button
                             onClick={handleCopy}
                             disabled={!receivedText}
                             className={`w-full py-6 rounded-[2rem] font-black text-2xl shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${copied ? 'bg-green-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white disabled:bg-slate-900 disabled:text-slate-800 disabled:shadow-none'}`}
                           >
                              {copied ? <Check size={28} /> : <Copy size={28} />}
                              {copied ? 'Copied!' : 'Copy Received Text'}
                           </button>
                        </motion.div>
                      )}
                   </AnimatePresence>
                </div>
             )}
          </div>
      </main>

      <Footer />

      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white text-slate-950 px-6 py-4 rounded-full font-bold shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            notification.type === 'success' ? 'bg-green-500 text-white' : 
            notification.type === 'role' ? 'bg-purple-500 text-white' : 
            notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
          }`}>
             {notification.type === 'success' && <Check size={18} strokeWidth={3} />}
             {notification.type === 'role' && <RefreshCw size={18} strokeWidth={3} />}
             {notification.type === 'error' && <Info size={18} strokeWidth={3} />}
             {notification.type === 'info' && <Bell size={18} strokeWidth={3} />}
          </div>
          {notification.message}
        </div>
      )}
    </div>
  );
}
