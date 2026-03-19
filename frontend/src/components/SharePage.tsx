import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, RefreshCw, Send, Check, Monitor, Smartphone, Clock, Bell, Info } from 'lucide-react';
import { socket } from '../lib/socket';

export default function SharePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null);
  const [userCount, setUserCount] = useState<number>(0);
  const [text, setText] = useState<string>('');
  const [receivedText, setReceivedText] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' | 'role' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isTabInactive, setIsTabInactive] = useState(false);

  const socketRef = useRef(socket);

  const shareUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/s/${roomId}`;
    }
    return '';
  }, [roomId]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const handleVisibilityChange = () => setIsTabInactive(document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const sendBrowserNotification = (title: string, body: string) => {
    if (isTabInactive && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  };

  useEffect(() => {
    if (!roomId) return;
    socketRef.current.connect();
    socketRef.current.emit('join-room', roomId);

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
        sendBrowserNotification('Easy Share', msg);
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
      sendBrowserNotification('Easy Share', msg);
    });

    socketRef.current.on('error', (msg) => {
      setNotification({ message: `Error: ${msg}`, type: 'error' });
    });

    return () => {
      socketRef.current.off('room-status');
      socketRef.current.off('text-updated');
      socketRef.current.off('role-swapped');
      socketRef.current.off('notification');
      socketRef.current.off('error');
      socketRef.current.disconnect();
    };
  }, [roomId, role, isTabInactive]);

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
    if (text.trim()) {
      socketRef.current.emit('send-text', text);
      setText('');
    }
  };

  const handleSwitchRoll = () => {
    socketRef.current.emit('switch-role');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(receivedText);
    setCopied(true);
    setNotification({ message: 'Text copied to clipboard!', type: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 md:p-8 font-sans transition-all duration-500">
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between bg-slate-900/50 backdrop-blur-md border border-slate-800 p-4 rounded-2xl mb-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${userCount === 2 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="font-semibold text-sm">
            {userCount === 2 ? 'Connected' : 'Waiting for device...'}
          </span>
          <span className="text-slate-500 text-xs bg-slate-800 px-2 py-1 rounded-full">{userCount}/2 devices</span>
        </div>
        
        {role && (
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                {role === 'sender' ? <Monitor size={14} className="text-blue-400" /> : <Smartphone size={14} className="text-purple-400" />}
                <span>{role}</span>
             </div>
             {userCount === 2 && (
               <button 
                onClick={handleSwitchRoll}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all text-slate-300 hover:text-white border border-slate-700 shadow-lg"
                title="Switch Direction"
               >
                 <RefreshCw size={14} />
                 <span className="text-[10px] font-bold uppercase tracking-tight">Switch Role</span>
               </button>
             )}
          </div>
        )}
      </div>

      <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col items-center justify-center">
        {userCount < 2 ? (
          <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-700">
            <div className="p-6 bg-white rounded-3xl shadow-2xl transition-transform hover:scale-105 duration-300">
              <QRCodeSVG value={shareUrl} size={220} level="H" />
            </div>
            
            <div className="text-center space-y-4">
               <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                  Easy Share
               </h1>
               <p className="text-slate-400 max-w-sm">
                 Scan this QR code with another device or share the link to start instant text sharing.
               </p>
            </div>

            <div className="w-full flex items-center gap-2 p-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group">
              <input 
                type="text" 
                readOnly 
                value={shareUrl} 
                className="flex-1 bg-transparent text-sm text-slate-400 outline-none" 
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setNotification({ message: 'Link copied!', type: 'success' });
                }}
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-8 animate-in slide-in-from-bottom-5 duration-500">
            {role === 'sender' ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-lg font-medium flex items-center gap-2">
                     <Send size={18} className="text-blue-400" />
                     Sender Mode
                   </h3>
                   <span className="text-xs text-slate-500 italic">Connected device will receive this instantly</span>
                </div>
                
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type something to share..."
                  className="w-full min-h-[300px] bg-slate-900/50 border border-slate-800 rounded-3xl p-6 text-xl text-slate-100 outline-none focus:border-blue-500/50 transition-colors resize-none placeholder-slate-600 shadow-inner"
                />
                
                <button
                  onClick={handleSend}
                  disabled={!text.trim()}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20"
                >
                  <Send size={20} />
                  Send Text
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-lg font-medium flex items-center gap-2 text-purple-400">
                     <Smartphone size={18} />
                     Receiver Mode
                   </h3>
                   {expiresAt && (
                     <div className="flex items-center gap-2 bg-slate-900 border border-amber-500/30 px-3 py-1.5 rounded-full text-amber-400 text-sm font-bold">
                        <Clock size={14} className="animate-spin-slow" />
                        {timeLeft}s
                     </div>
                   )}
                </div>
                
                <div 
                  className={`w-full min-h-[300px] bg-slate-900 border ${receivedText ? 'border-purple-500/20 shadow-purple-500/5' : 'border-slate-800'} rounded-3xl p-6 flex items-center justify-center transition-all duration-500`}
                >
                  {receivedText ? (
                    <p className="text-2xl text-slate-100 text-center break-words max-w-full">
                      {receivedText}
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-slate-600">
                      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center animate-pulse">
                        <Monitor size={32} />
                      </div>
                      <p>Waiting for sender to type...</p>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleCopy}
                  disabled={!receivedText}
                  className={`w-full h-16 ${copied ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'} disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] border border-slate-700`}
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                  {copied ? 'Copied to Clipboard' : 'Copy Received Text'}
                </button>
              </div>
            )}
            <div className="pt-4 border-t border-slate-900">
              <button 
                disabled 
                className="w-full py-4 text-slate-600 border border-dotted border-slate-800 rounded-xl text-sm flex items-center justify-center gap-2 cursor-not-allowed grayscale opacity-50"
              >
                <div className="w-2 h-2 rounded-full bg-slate-800" />
                File Sharing (Coming Soon)
              </button>
            </div>
          </div>
        )}
      </div>

      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-100 text-slate-950 px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            notification.type === 'success' ? 'bg-green-500 text-white' : 
            notification.type === 'role' ? 'bg-purple-500 text-white' : 
            notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
          }`}>
             {notification.type === 'success' && <Check size={14} strokeWidth={3} />}
             {notification.type === 'role' && <RefreshCw size={14} strokeWidth={3} />}
             {notification.type === 'error' && <Info size={14} strokeWidth={3} />}
             {notification.type === 'info' && <Bell size={14} strokeWidth={3} />}
          </div>
          {notification.message}
        </div>
      )}

      <footer className="mt-8 text-center">
        <p className="text-slate-600 text-xs flex items-center justify-center gap-1">
          <Info size={12} />
          Session is temporary and will be deleted after disconnect.
        </p>
      </footer>
    </main>
  );
}
