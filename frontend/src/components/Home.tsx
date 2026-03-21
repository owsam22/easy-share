import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { 
  ArrowRight, Bell, Check, Clipboard, Clock, Copy, Info, 
  RefreshCw, Smartphone, Share2, FilePlus, Zap, ShieldCheck 
} from 'lucide-react';
import { socket } from '../lib/socket';
import Header from './Header';
import Footer from './Footer';
import FileShare from './FileShare';

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
  const [shareType, setShareType] = useState<'text' | 'file'>('text');
  
  // New state for QR code visibility
  const [showQR, setShowQR] = useState(true);
  const [forceShowQR, setForceShowQR] = useState(false);

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

  useEffect(() => {
    const handleShareTypeSwapped = (newType: 'text' | 'file') => {
      setShareType(newType);
    };

    socketRef.current.on('share-type-swapped', handleShareTypeSwapped);
    return () => {
      socketRef.current.off('share-type-swapped', handleShareTypeSwapped);
    };
  }, []);

  // Effect to automatically hide/show the QR code 
  useEffect(() => {
    if (userCount >= 2) {
      setShowQR(false);
    } else {
      setShowQR(true);
      setForceShowQR(false); // reset force state when it automatically shows
    }
  }, [userCount]);

  const isQRVisible = showQR || forceShowQR;

  const handleShareTypeChange = (newType: 'text' | 'file') => {
    setShareType(newType);
    if (isConnected) {
      socketRef.current.emit('switch-share-type', newType);
    }
  };

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
        <div className="text-center space-y-4 mb-20">
           <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter leading-none uppercase italic">
              Instant <span className="text-blue-500">{shareType === 'text' ? 'Sync' : 'Cloud'}</span>
           </h1>
           <p className="text-slate-400 font-bold max-w-lg mx-auto uppercase tracking-[0.2em] text-[10px] md:text-xs">
              Universal bridge for your text & files. No apps. No accounts. 
              <br className="hidden md:block" />
              Just scan and start sharing instantly.
           </p>
        </div>

        <div className="flex bg-slate-200/50 p-1.5 rounded-full mb-12 w-fit mx-auto shadow-inner backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-500 relative">
           <button 
            onClick={() => handleShareTypeChange('text')}
            className={`relative flex items-center justify-center gap-2 py-3 px-8 rounded-full transition-colors font-black uppercase tracking-widest text-[11px] z-10 ${
              shareType === 'text' ? 'text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {shareType === 'text' && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 bg-blue-500 rounded-full shadow-md shadow-blue-500/20"
                transition={{ type: "spring", stiffness: 450, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <Zap size={16} /> Text Sync
            </span>
          </button>
          
          <button 
            onClick={() => handleShareTypeChange('file')}
            className={`relative flex items-center justify-center gap-2 py-3 px-8 rounded-full transition-colors font-black uppercase tracking-widest text-[11px] z-10 ${
              shareType === 'file' ? 'text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {shareType === 'file' && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 bg-blue-500 rounded-full shadow-md shadow-blue-500/20"
                transition={{ type: "spring", stiffness: 450, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <FilePlus size={16} /> File Sync
            </span>
          </button>
        </div>

        <div className={`grid grid-cols-1 ${isQRVisible ? 'md:grid-cols-12 gap-10' : 'md:grid-cols-1 w-full max-w-4xl mx-auto'} items-start relative transition-all duration-500`}>
           <AnimatePresence mode="wait">
             {isQRVisible && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95, x: -20 }}
                 animate={{ opacity: 1, scale: 1, x: 0 }}
                 exit={{ opacity: 0, scale: 0.95, x: -20, transition: { duration: 0.2 } }}
                 transition={{ duration: 0.4, type: 'spring', bounce: 0.2 }}
                 className="md:col-span-5 bg-white p-6 pt-10 md:p-8 rounded-[2.5rem] shadow-xl shadow-blue-500/5 border border-white space-y-8 flex flex-col items-center relative"
               >
                  <span className="text-[10px] absolute top-6 left-1/2 -translate-x-1/2 uppercase font-black tracking-widest text-slate-400">Scan to Connect</span>
                  {!showQR && (
                    <button 
                      onClick={() => setForceShowQR(false)}
                      className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-full transition-colors z-10 shadow-sm"
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  )}
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
               </motion.div>
             )}
           </AnimatePresence>

           <motion.div 
             layout
             transition={{ duration: 0.5, type: 'spring', bounce: 0.2 }}
             className={`${isQRVisible ? 'md:col-span-7' : 'w-full'} relative [perspective:2000px] min-h-[400px]`}
           >
              {!isQRVisible && (
                 <motion.button
                   initial={{ opacity: 0, y: -10 }}
                   animate={{ opacity: 1, y: 0 }}
                   onClick={() => setForceShowQR(true)}
                   className="absolute -top-14 right-0 flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 text-slate-500 hover:text-blue-500 hover:border-blue-200 transition-all font-bold text-xs uppercase tracking-widest z-20"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
                    Show QR
                 </motion.button>
              )}
              <motion.div
                animate={{ rotateY: (shareType === 'file' && isConnected && userCount >= 2) ? 180 : 0 }}
                transition={{ duration: 0.8, type: 'spring', stiffness: 260, damping: 20 }}
                style={{ transformStyle: 'preserve-3d' }}
                className="w-full h-full"
              >
                 {/* FRONT: Text Sync Stages */}
                 <div className="w-full h-full [backface-visibility:hidden] space-y-6">
                                         {userCount < 2 && (
                       <div className={`bg-white p-10 rounded-[2.5rem] border-2 flex flex-col items-center justify-center min-h-[400px] text-center space-y-6 transition-colors duration-500 ${isConnected ? 'border-green-100 shadow-xl shadow-green-500/5' : 'border-dashed border-blue-100 shadow-sm'}`}>
                          <img 
                            src="https://media1.tenor.com/m/0chWb5VggvAAAAAd/pizzaninjas-pizza-ninjas.gif" 
                            alt="Ninja" 
                            className="w-40 h-40 animate-bounce"
                          />
                          <div className="space-y-2">
                             <h3 className="text-2xl font-black text-slate-800 tracking-tight">{!isConnected ? 'Connecting to Server...' : 'Waiting for Device...'}</h3>
                             <p className="text-sm text-slate-500 font-medium max-w-sm mx-auto">{!isConnected ? 'Establishing a secure connection to the backend infrastructure.' : 'Server connected! Once a device scans the QR code, sharing will begin.'}</p>
                          </div>
                       </div>
                    )}

                    {false && (
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
                                    <div className={`px-4 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm ${role === 'sender' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}`}>
                                       <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                       You are {role}
                                    </div>
                                    {expiresAt && (
                                       <div className="flex items-center gap-2 text-red-500 font-bold text-[10px] uppercase tracking-tight bg-red-50 px-3 py-2 rounded-2xl border border-red-100">
                                          <Clock size={12} />
                                          Expires {timeLeft}s
                                       </div>
                                    )}
                                 </div>
                                 {role === 'receiver' && (
                                   <button 
                                     onClick={switchRole}
                                     className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-2xl transition-all border border-slate-200 shadow-sm active:scale-95 group"
                                   >
                                      <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                                      <span className="text-[10px] font-black uppercase tracking-wider">Send from here</span>
                                   </button>
                                 )}
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
                                       className="w-full flex-1 p-6 bg-slate-50 rounded-3xl border-2 border-transparent focus:border-blue-100 focus:bg-white transition-all text-xl font-medium outline-none resize-none placeholder:text-slate-500 min-h-[250px]"
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
                                  <div className={`w-full flex-1 p-4 md:p-8 rounded-3xl flex items-center justify-center text-center transition-all overflow-hidden ${receivedText ? 'bg-green-50/50' : 'bg-slate-50 border-2 border-dashed border-slate-200'}`}>
                                     {receivedText ? (
                                       <div className="w-full max-h-[300px] overflow-y-auto">
                                          <p className="text-lg md:text-2xl font-bold text-slate-800 break-all whitespace-pre-wrap leading-relaxed py-2">
                                             {receivedText}
                                          </p>
                                       </div>
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

                  <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)]">
                     <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-blue-600/10 border border-white h-full min-h-[400px]">
                        <FileShare 
                          socket={socketRef.current}
                          roomId={roomId!}
                          role={role}
                          isConnected={isConnected}
                          userCount={userCount}
                        />
                     </div>
                  </div>
              </motion.div>
           </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
           <div className="bg-white/50 backdrop-blur-sm p-8 rounded-[2rem] border border-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all group">
              <div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
                 <Zap size={24} />
              </div>
              <h4 className="font-black text-slate-900 mb-2 uppercase tracking-tight">Rapid Sync</h4>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">Share text and files instantly across any two devices connected via QR code.</p>
           </div>
           <div className="bg-white/50 backdrop-blur-sm p-8 rounded-[2rem] border border-white hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/5 transition-all group">
              <div className="w-12 h-12 bg-purple-500 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-purple-500/20">
                 <ShieldCheck size={24} />
              </div>
              <h4 className="font-black text-slate-900 mb-2 uppercase tracking-tight">Private Link</h4>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">End-to-end temporary tunnel ensures your data never touches permanent storage.</p>
           </div>
           <div className="bg-white/50 backdrop-blur-sm p-8 rounded-[2rem] border border-white hover:border-amber-200 hover:shadow-xl hover:shadow-amber-500/5 transition-all group">
              <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
                 <Clock size={24} />
              </div>
              <h4 className="font-black text-slate-900 mb-2 uppercase tracking-tight">Auto-Purge</h4>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">All shared data is automatically wiped after 60 seconds or upon disconnection.</p>
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
