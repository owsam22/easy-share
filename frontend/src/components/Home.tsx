import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { 
  ArrowRight, Bell, Check, Clipboard, Clock, Copy, Info, 
  Monitor, RefreshCw, Smartphone, Share2 
} from 'lucide-react';
import { socket } from '../lib/socket';
import Header from './Header';
import Footer from './Footer';

function ShareContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const roomIdFromUrl = searchParams.get('room');

  const [roomId, setRoomId] = useState<string | null>(null);
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (roomIdFromUrl) {
        setRoomId(roomIdFromUrl);
      } else {
        const newRoomId = uuidv4();
        setRoomId(newRoomId);
        setSearchParams({ room: newRoomId }, { replace: true });
      }
    }
  }, [roomIdFromUrl, setSearchParams]);

  const shareUrl = useMemo(() => {
    if (typeof window !== 'undefined' && roomId) {
      return `${window.location.origin}/?room=${roomId}`;
    }
    return '';
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

    return () => {
      socketRef.current.off('connect');
      socketRef.current.off('disconnect');
      socketRef.current.off('room-status');
      socketRef.current.off('text-updated');
      socketRef.current.off('role-swapped');
      socketRef.current.off('notification');
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
    navigator.clipboard.writeText(shareUrl);
    setNotification({ message: 'Link copied to clipboard!', type: 'success' });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Easy Share',
          text: 'Connect and share text instantly with Easy Share!',
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      handleCopy();
    }
  };

  const handleCopyReceived = () => {
    navigator.clipboard.writeText(receivedText);
    setCopied(true);
    setNotification({ message: 'Text copied to clipboard!', type: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        setText(clipboardText);
        setNotification({ message: 'Text pasted from clipboard!', type: 'success' });
      } else {
        setNotification({ message: 'Clipboard is empty', type: 'info' });
      }
    } catch (err) {
      setNotification({ message: 'Need permission to paste', type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans">
      <Header connected={isConnected} />

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-10 flex flex-col">
        <div className="text-center space-y-4 mb-12">
           <h2 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight">
             Share Text Instantly.
           </h2>
           <p className="text-slate-500 font-medium text-lg max-w-xl mx-auto">
             No accounts. No wait. Scan the code to connect two devices and start sharing.
           </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
           <div className="md:col-span-5 bg-white p-8 rounded-[2.5rem] shadow-xl shadow-blue-500/5 border border-white space-y-8 flex flex-col items-center">
              <div className="bg-blue-50 p-4 rounded-3xl w-full flex flex-col items-center">
                 <QRCodeSVG value={shareUrl} size={200} level="H" includeMargin className="rounded-xl" />
              </div>
              <div className="w-full space-y-4">
                 <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <Info size={16} className="text-blue-500 shrink-0" />
                    <p className="text-xs font-bold text-slate-600">Scan this code with your phone camera.</p>
                 </div>
                 <div className="flex gap-3">
                    <button 
                     onClick={handleCopy}
                     className="flex-1 py-4 bg-white border-2 border-slate-100 hover:border-blue-200 rounded-2xl font-bold text-slate-700 flex items-center justify-center gap-2 transition-all"
                    >
                       <Copy size={18} />
                       Copy
                    </button>
                    <button 
                     onClick={handleShare}
                     className="flex-1 py-4 bg-blue-500 hover:bg-blue-600 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20"
                    >
                       <Share2 size={18} />
                       Share
                    </button>
                 </div>
              </div>
           </div>

           <div className="md:col-span-7 space-y-6">
              {!isConnected && (
                 <div className="bg-white p-10 rounded-[2.5rem] border-2 border-dashed border-blue-100 flex flex-col items-center justify-center min-h-[400px] text-center space-y-6">
                    <img 
                      src="https://media1.tenor.com/m/0chWb5VggvAAAAAd/pizzaninjas-pizza-ninjas.gif" 
                      alt="Ninja" 
                      className="w-40 h-40 animate-bounce"
                    />
                    <div className="space-y-2">
                       <h3 className="text-xl font-bold text-slate-800">Waiting for Device...</h3>
                       <p className="text-sm text-slate-400 font-medium">Once a device scans the code, sharing will begin.</p>
                    </div>
                 </div>
              )}

              {isConnected && userCount < 2 && (
                 <div className="bg-white p-10 rounded-[2.5rem] shadow-xl shadow-blue-500/5 border border-white flex flex-col items-center justify-center min-h-[400px] text-center space-y-8">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                       <Smartphone size={32} strokeWidth={2.5} />
                    </div>
                    <div className="space-y-4">
                       <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Connected!</h3>
                       <p className="text-slate-500 font-medium max-w-xs">
                          Waiting for your other device to join the room. Keep this page open!
                       </p>
                    </div>
                    <div className="flex gap-2">
                       <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" />
                       <div className="w-3 h-3 bg-blue-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                       <div className="w-3 h-3 bg-blue-100 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                 </div>
              )}

              {isConnected && userCount >= 2 && (
                 <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl shadow-blue-600/10 border border-white min-h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                       <div className="flex items-center gap-3">
                          <div className={`px-4 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-widest ${role === 'sender' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                             You are: {role}
                          </div>
                          {expiresAt && (
                             <div className="flex items-center gap-1 text-slate-400 font-bold text-[10px]">
                                <Clock size={12} />
                                {timeLeft}s
                             </div>
                          )}
                       </div>
                       <button 
                        onClick={switchRole}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded-xl transition-all border border-slate-100 shadow-sm"
                        title="Switch Role"
                       >
                          <RefreshCw size={14} />
                          <span className="text-[10px] font-extrabold uppercase tracking-widest">Switch Role</span>
                       </button>
                    </div>

                    <div className="flex-1 flex flex-col gap-6">
                      <AnimatePresence mode="wait">
                        {role === 'sender' ? (
                          <motion.div
                            key="sender"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="flex-1 flex flex-col gap-6"
                          >
                            <div className="relative group flex-1 flex flex-col">
                               <textarea
                                 value={text}
                                 onChange={(e) => setText(e.target.value)}
                                 placeholder="Type or paste something here..."
                                 className="w-full flex-1 p-6 bg-slate-50 rounded-3xl border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all text-xl font-medium outline-none resize-none placeholder:text-slate-300 min-h-[250px]"
                               />
                               <button
                                 onClick={handlePaste}
                                 className="absolute right-4 bottom-4 p-3 bg-white border border-slate-100 rounded-2xl shadow-sm text-slate-400 hover:text-blue-500 hover:border-blue-100 transition-all flex items-center gap-2 text-xs font-bold"
                                 title="Paste from clipboard"
                               >
                                  <Clipboard size={16} />
                                  Paste
                               </button>
                            </div>
                            <button
                               onClick={handleSend}
                               disabled={!text.trim()}
                               className="w-full py-5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-3xl font-black text-xl shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 group"
                            >
                               Send Text
                               <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="receiver"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="flex-1 flex flex-col gap-6"
                          >
                            <div className={`w-full flex-1 p-8 rounded-3xl flex items-center justify-center text-center transition-all ${receivedText ? 'bg-green-50/50' : 'bg-slate-50 border-2 border-dashed border-slate-200'}`}>
                               {receivedText ? (
                                 <p className="text-2xl font-bold text-slate-800 break-words leading-relaxed">
                                    {receivedText}
                                 </p>
                               ) : (
                                 <div className="space-y-4 opacity-40">
                                    <Bell size={40} className="mx-auto text-slate-400" />
                                    <p className="font-bold text-sm tracking-widest uppercase">Watching for incoming text...</p>
                                 </div>
                               )}
                            </div>
                            <button
                              onClick={handleCopyReceived}
                              disabled={!receivedText}
                              className={`w-full py-5 rounded-3xl font-black text-xl shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${copied ? 'bg-green-500 text-white' : 'bg-slate-800 hover:bg-black text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none'}`}
                            >
                               {copied ? <Check size={20} /> : <Copy size={20} />}
                               {copied ? 'Copied!' : 'Copy Received Text'}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                 </div>
              )}
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
           <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 mb-4">
                 <Monitor size={20} />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">Device Sync</h4>
              <p className="text-sm text-slate-500">Connect PC to Phone, or any two devices instantly.</p>
           </div>
           <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-500 mb-4">
                 <Bell size={20} />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">Instant Share</h4>
              <p className="text-sm text-slate-500">Get notified correctly when new text is received.</p>
           </div>
           <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 mb-4">
                 <Clock size={20} />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">Auto-Wipe</h4>
              <p className="text-sm text-slate-500">Messages expire after 60s for your privacy.</p>
           </div>
        </div>
      </main>

      <Footer />

      {notification && (
        <div className="fixed top-10 right-10 bg-slate-900 text-white px-6 py-4 rounded-2xl font-bold shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-300 z-[100]">
           <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
             notification.type === 'success' ? 'bg-green-500' : 
             notification.type === 'role' ? 'bg-purple-500' : 
             notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
           }`}>
              {notification.type === 'success' && <Check size={14} strokeWidth={3} />}
              {notification.type === 'role' && <RefreshCw size={14} strokeWidth={3} />}
              {notification.type === 'error' && <Info size={14} strokeWidth={3} />}
              {notification.type === 'info' && <Bell size={14} strokeWidth={3} />}
           </div>
           {notification.message}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
       <div className="min-h-screen flex items-center justify-center bg-blue-50">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
       </div>
    }>
      <ShareContent />
    </Suspense>
  );
}
