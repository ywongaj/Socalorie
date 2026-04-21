/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  Bell, 
  User, 
  Plus, 
  ChevronLeft, 
  LogOut, 
  Edit2, 
  Battery, 
  Calendar as CalendarIcon, 
  Users,
  Search,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Smile,
  Frown,
  Activity as ActivityIcon
} from 'lucide-react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp, 
  orderBy, 
  limit,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { auth, db, logout, signInWithGoogle } from './lib/firebase';
import { UserProfile, EnergyRecord, Activity, Notification, Friendship } from './types';
import { format, isToday, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';

type ViewState = 'landing' | 'identify' | 'register-profile' | 'welcome-back' | 'welcome-new' | 'home' | 'daily-detail' | 'emotion-detail' | 'friend-detail' | 'notifications' | 'profile';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('landing');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [registrationEmail, setRegistrationEmail] = useState('');

  // Daily Energy State (Lifted for Sync)
  const [dailyInitialScore, setDailyInitialScore] = useState(100);
  const [dailyActivities, setDailyActivities] = useState<{name: string, value: number, id: string}[]>([]);
  const dailyTotalScore = Math.max(0, dailyInitialScore + dailyActivities.reduce((sum, act) => sum + act.value, 0));

  // Persistence of auth state & Live Profile Sync
  useEffect(() => {
    let profileUnsubscribe: () => void = () => {};

    const setupProfileListener = (uid: string) => {
      if (profileUnsubscribe) profileUnsubscribe();
      const docRef = doc(db, 'users', uid);
      profileUnsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setProfile({ uid: uid, ...docSnap.data() } as UserProfile);
          setCurrentView(prev => {
            if (['landing', 'identify', 'register-profile'].includes(prev)) return 'home';
            return prev;
          });
        } else {
          // If authed but no profile, send to setup
          setProfile(null);
          setCurrentView('register-profile');
        }
      }, (error) => {
        console.error("Profile Sync Error:", error);
        // Important: if we get a permission error, it might be because the doc is new
        // and security rules are catching up, or UID mismatch.
        // We shouldn't necessarily set profile to null here unless it's a 404.
      });
    };

    const authUnsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      const uid = authUser?.uid || localStorage.getItem('socalorie_uid');
      
      if (uid) {
        setupProfileListener(uid);
      } else {
        setProfile(null);
        if (profileUnsubscribe) profileUnsubscribe();
        setCurrentView(prev => {
          if (['home', 'daily-detail', 'emotion-detail', 'friend-detail', 'notifications', 'profile'].includes(prev)) {
            return 'landing';
          }
          return prev;
        });
      }
      setLoading(false);
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  // Listen for notifications
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      setNotifications(docs);
      setUnreadCount(docs.filter(n => n.status === 'unread').length);
    });
    return () => unsubscribe();
  }, [user]);

  const fetchProfile = async (uid: string) => {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setProfile({ uid, ...docSnap.data() } as UserProfile);
      if (currentView === 'landing' || currentView === 'identify') {
        setCurrentView('home');
      }
    }
  };

  const navigateTo = (view: ViewState) => setCurrentView(view);

  const handleLoginSuccess = (uid: string) => {
    localStorage.setItem('socalorie_uid', uid);
    // Force trigger profile fetching if listener isn't already active for this UID
    const docRef = doc(db, 'users', uid);
    getDoc(docRef).then(docSnap => {
      if (docSnap.exists()) {
        setProfile({ uid, ...docSnap.data() } as UserProfile);
        navigateTo('welcome-back');
      }
    });
  };

  const handleRegistrationComplete = (newProfile: UserProfile) => {
    setProfile(newProfile);
    navigateTo('welcome-new');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-page-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white shadow-xl relative overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        {currentView === 'landing' && <LandingView onEnter={() => navigateTo('identify')} />}
        {currentView === 'identify' && (
          <IdentifyView 
            onBack={() => navigateTo('landing')} 
            onExisting={(uid) => handleLoginSuccess(uid)} 
            onNew={(email) => { 
              setRegistrationEmail(email); 
              navigateTo('register-profile'); 
            }} 
          />
        )}
        {currentView === 'register-profile' && (
          <RegisterProfileView 
            email={registrationEmail}
            user={user}
            onBack={() => navigateTo('identify')} 
            onComplete={(p) => handleRegistrationComplete(p)} 
          />
        )}
        {currentView === 'welcome-back' && <WelcomeView type="back" onContinue={() => navigateTo('home')} />}
        {currentView === 'welcome-new' && <WelcomeView type="new" onContinue={() => navigateTo('home')} />}
        
        {currentView === 'home' && <HomeView navigateTo={navigateTo} energyScore={dailyTotalScore} />}
        {currentView === 'daily-detail' && (
          <DailyEnergyDetail 
            onBack={() => navigateTo('home')} 
            initialScore={dailyInitialScore} 
            setInitialScore={setDailyInitialScore}
            activities={dailyActivities}
            setActivities={setDailyActivities}
            score={dailyTotalScore}
            profile={profile}
            onUpdated={() => {}} // No-op as profile is now synced real-time
          />
        )}
        {currentView === 'emotion-detail' && (
          <EmotionRecordDetail 
            onBack={() => navigateTo('home')} 
            currentScore={dailyTotalScore}
            userId={user?.uid || ''}
          />
        )}
        {currentView === 'friend-detail' && (
          <FriendEnergyDetail 
            onBack={() => navigateTo('home')} 
            userProfile={profile}
            currentEnergy={dailyTotalScore}
            onRefresh={() => {}} // No-op
          />
        )}
        
        {currentView === 'notifications' && <NotificationsView notifications={notifications} userProfile={profile} onRefresh={() => {}} />}
        {currentView === 'profile' && <UserProfileView profile={profile} onUpdated={() => {}} navigateTo={navigateTo} />}
      </AnimatePresence>

      {!['landing', 'identify', 'register-profile', 'welcome-back', 'welcome-new'].includes(currentView) && (
        <Toolbar currentView={currentView} navigateTo={navigateTo} unreadCount={unreadCount} />
      )}
    </div>
  );
}

// --- VIEWS ---

function LandingView({ onEnter }: { onEnter: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      // App.tsx auth listener handles navigation
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex-1 flex flex-col items-center justify-center p-8 space-y-12 bg-page-bg"
    >
      <div className="text-center space-y-4">
        <div className="w-24 h-24 bg-primary border-4 border-black rounded-[32px] flex items-center justify-center mx-auto shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] rotate-3">
          <Battery className="w-12 h-12 text-black" />
        </div>
        <h1 className="text-5xl font-black tracking-tight text-ink uppercase mt-8">Socalorie</h1>
        <p className="text-ink font-bold opacity-60">Charge up your social life.</p>
      </div>

      <div className="w-full space-y-6">
        <button 
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-4 bg-primary border-4 border-black text-ink rounded-2xl font-black text-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[6px] active:translate-y-[6px] active:shadow-none transition-all disabled:opacity-50"
        >
          {loading ? 'Authenticating...' : 'Sign in with Google'}
        </button>
        <div className="flex items-center gap-4 py-2">
          <div className="flex-1 h-[2px] bg-black/10"></div>
          <span className="text-[10px] font-black uppercase text-ink/20 tracking-widest">Or enter email</span>
          <div className="flex-1 h-[2px] bg-black/10"></div>
        </div>
        <button 
          onClick={onEnter}
          className="w-full py-4 bg-white border-4 border-black text-black rounded-2xl font-black text-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[6px] active:translate-y-[6px] active:shadow-none transition-all"
        >
          Enter Energy Zone
        </button>
      </div>
    </motion.div>
  );
}

function IdentifyView({ onBack, onExisting, onNew }: { onBack: () => void, onExisting: (uid: string) => void, onNew: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [showNewUserMsg, setShowNewUserMsg] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setChecking(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        onExisting(snap.docs[0].id);
      } else {
        setShowNewUserMsg(true);
        // Short delay to let user see the message before auto-navigating
        setTimeout(() => {
          onNew(email.toLowerCase());
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Identification failed: ${err.message || 'Unknown network error'}`);
    } finally {
      if (!showNewUserMsg) setChecking(false);
    }
  };

  return (
    <motion.div 
      initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -300, opacity: 0 }}
      className="flex-1 p-8 pt-12 bg-page-bg space-y-10"
    >
      <button onClick={onBack} className="p-3 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
        <ChevronLeft className="w-6 h-6 text-black" strokeWidth={3} />
      </button>

      <div className="space-y-2">
        <h2 className="text-4xl font-black uppercase tracking-tight italic leading-tight">Access Node</h2>
        <p className="text-xs font-black text-ink/30 uppercase tracking-[0.2em]">Enter your digital identifier</p>
      </div>

      <AnimatePresence>
        {showNewUserMsg && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="p-5 bg-primary border-4 border-black rounded-3xl flex items-start gap-3 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          >
            <AlertCircle className="w-6 h-6 text-black mt-0.5 shrink-0" strokeWidth={3} />
            <p className="text-sm text-black font-black uppercase tracking-tight leading-snug">New unit detected. Preparing initialization protocol...</p>
          </motion.div>
        )}
      </AnimatePresence>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/40 ml-2">Email Address</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vibe@check.com"
            required
            readOnly={checking}
            className="w-full p-6 bg-white border-4 border-black rounded-[24px] outline-none font-bold shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-none transition-all placeholder:text-ink/10"
          />
        </div>
        <button 
          type="submit"
          disabled={checking}
          className="w-full py-5 bg-black text-white border-4 border-black rounded-[32px] font-black uppercase tracking-[0.2em] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all disabled:opacity-50"
        >
          {checking ? 'ANALYZING...' : 'INITIALIZE ACCOUNT'}
        </button>
      </form>
    </motion.div>
  );
}

function RegisterProfileView({ email, user, onBack, onComplete }: { email: string, user: FirebaseUser | null, onBack: () => void, onComplete: (profile: UserProfile) => void }) {
  const [username, setUsername] = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfilePic(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async () => {
    if (!username) {
      alert("Alias is required.");
      return;
    }
    setSaving(true);
    try {
      // Use auth UID if available, otherwise generate a stable one for email flow
      const uid = auth.currentUser?.uid || `usr_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
      const userRef = doc(db, 'users', uid); 
      
      const emailToStore = (email || auth.currentUser?.email || '').toLowerCase();

      await setDoc(userRef, {
        username,
        email: emailToStore,
        profilePicUrl: profilePic || auth.currentUser?.photoURL || null,
        currentEnergy: 100,
        createdAt: serverTimestamp()
      });
      
      const newProfile = {
        uid,
        username,
        email: emailToStore,
        profilePicUrl: profilePic || auth.currentUser?.photoURL || null,
        currentEnergy: 100
      };
      
      localStorage.setItem('socalorie_uid', uid);
      // Pass the profile up or trigger sync
      onComplete(newProfile as UserProfile);
    } catch (err: any) {
      console.error(err);
      alert('Initialization failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -300, opacity: 0 }}
      className="flex-1 p-8 pt-12 bg-page-bg space-y-10"
    >
      <button onClick={onBack} className="p-3 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
        <ChevronLeft className="w-6 h-6 text-black" strokeWidth={3} />
      </button>

      <div className="space-y-2">
        <h2 className="text-4xl font-black uppercase tracking-tight italic leading-tight">Config Your Profile</h2>
        <p className="text-xs font-black text-ink/30 uppercase tracking-[0.2em]">Almost there, scout</p>
      </div>
      
      <div className="space-y-12 flex flex-col items-center">
        <div className="relative group">
          <div className="w-40 h-40 bg-white border-4 border-black rounded-[48px] flex items-center justify-center overflow-hidden shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] rotate-3">
            {profilePic ? <img src={profilePic} alt="Preview" className="w-full h-full object-cover" /> : <User className="w-20 h-20 text-ink/10" strokeWidth={3} />}
          </div>
          <label className="absolute -bottom-2 -right-2 bg-primary text-black p-3 border-4 border-black rounded-2xl cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:scale-110 active:scale-95 transition-transform translate-x-2 translate-y-2">
            <Plus className="w-6 h-6" strokeWidth={3} />
            <input type="file" className="hidden" accept="image/*" onChange={handlePicUpload} />
          </label>
        </div>

        <div className="w-full space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/40 ml-2">Personal Alias</label>
          <input 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="cool_user_123"
            className="w-full p-4 bg-white border-4 border-black rounded-2xl outline-none font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-none transition-all placeholder:text-ink/10"
          />
        </div>

        <button 
          onClick={handleCreate}
          disabled={!username || saving}
          className="w-full py-5 bg-black text-white border-4 border-black rounded-[32px] font-black uppercase tracking-[0.2em] shadow-[8px_8px_0px_0px_rgba(64,64,64,0.3)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all disabled:opacity-20"
        >
          {saving ? 'Synchronizing...' : 'Complete Energy Profile'}
        </button>
      </div>
    </motion.div>
  );
}

function WelcomeView({ type, onContinue }: { type: 'back' | 'new', onContinue: () => void }) {
  const isNew = type === 'new';
  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.1, opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center p-8 space-y-12 bg-page-bg text-center"
    >
      <div className="relative group">
         <div className="w-40 h-40 bg-white border-4 border-black rounded-[48px] overflow-hidden shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] rotate-3 group-hover:rotate-0 transition-transform">
          <img src={isNew ? "https://api.dicebear.com/7.x/avataaars/svg?seed=new" : "https://api.dicebear.com/7.x/avataaars/svg?seed=back"} alt="Welcome" className="w-full h-full object-cover" />
        </div>
        <div className="absolute -bottom-4 -right-4 w-12 h-12 bg-primary border-4 border-black rounded-2xl flex items-center justify-center font-black text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">!</div>
      </div>

      <div className="space-y-4">
        <h2 className="text-4xl font-black uppercase tracking-tight italic">
          {isNew ? "Unit Ready" : "Welcome Back"}
        </h2>
        <p className="text-ink font-bold opacity-40 uppercase tracking-widest text-xs">
          {isNew ? "Registration successfully recorded" : "Synchronizing your data..."}
        </p>
      </div>

      <button 
        onClick={onContinue}
        className="w-full py-5 bg-black text-white border-4 border-black rounded-[32px] font-black uppercase tracking-[0.2em] shadow-[8px_8px_0px_0px_rgba(64,64,64,0.3)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
      >
        Enter Zone
      </button>
    </motion.div>
  );
}

// --- MAIN COMPONENTS ---

function HomeView({ navigateTo, energyScore }: { navigateTo: (view: ViewState) => void, energyScore: number }) {
  const getScoreColor = (score: number) => {
    if (score > 60) return 'bg-emerald-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar mb-20 pt-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-ink/60 text-[10px] uppercase font-black tracking-[0.2em] mb-1">Status: Social Butterfly 🦋</p>
          <h1 className="text-4xl font-black text-ink uppercase tracking-tight">Today's Vibe</h1>
          <p className="text-ink/40 text-xs font-bold font-sans uppercase tracking-widest">{format(new Date(), 'EEEE, do MMMM')}</p>
        </div>
      </header>

      {/* Block 1: Today Socalorie */}
      <motion.div 
        whileHover={{ translateZ: 0 }}
        onClick={() => navigateTo('daily-detail')}
        className={`border-4 border-black p-8 rounded-[32px] text-ink shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer relative overflow-hidden ${getScoreColor(energyScore)}`}
      >
        <div className="relative z-10 flex flex-col space-y-4">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-black/60">Today's Energy</span>
          <span className="text-8xl font-black font-display leading-none">{energyScore}</span>
          <span className="text-xs font-black uppercase tracking-widest text-black/80 flex items-center gap-2">
            <TrendingUp size={16} strokeWidth={3} /> {energyScore > 60 ? 'Feeling charged!' : 'Low Battery'}
          </span>
        </div>
        <div className="absolute -right-4 -top-4 opacity-10 rotate-12">
          <Battery size={140} strokeWidth={3} />
        </div>
      </motion.div>

      {/* Block 2 & 3 */}
      <div className="grid grid-cols-1 gap-6">
        <motion.div 
          onClick={() => navigateTo('emotion-detail')}
          className="bg-white border-4 border-black p-6 rounded-[32px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-between text-ink cursor-pointer group"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-400 border-2 border-black rounded-2xl flex items-center justify-center transform group-hover:rotate-6 transition-transform">
              <CalendarIcon className="text-black" strokeWidth={3} />
            </div>
            <div>
              <h3 className="font-black text-xl uppercase tracking-tight">Emotion Record</h3>
              <p className="text-[10px] text-ink/40 uppercase font-black tracking-widest">History & Analysis</p>
            </div>
          </div>
          <ChevronLeft className="rotate-180 text-black/30" strokeWidth={3} />
        </motion.div>

        <motion.div 
          onClick={() => navigateTo('friend-detail')}
          className="bg-secondary border-4 border-black p-6 rounded-[32px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-between text-white cursor-pointer group"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white border-2 border-black rounded-2xl flex items-center justify-center transform group-hover:-rotate-6 transition-transform">
              <Users className="text-black" strokeWidth={3} />
            </div>
            <div>
              <h3 className="font-black text-xl uppercase tracking-tight">Social Zone</h3>
              <p className="text-[10px] text-white/50 uppercase font-black tracking-widest">Check the squad</p>
            </div>
          </div>
          <ChevronLeft className="rotate-180 text-white/30" strokeWidth={3} />
        </motion.div>
      </div>
    </div>
  );
}

function DailyEnergyDetail({ onBack, initialScore, setInitialScore, activities, setActivities, score, profile, onUpdated }: { 
  onBack: () => void, 
  initialScore: number, 
  setInitialScore: (v: number) => void,
  activities: {name: string, value: number, id: string}[],
  setActivities: (v: any) => void,
  score: number,
  profile: UserProfile | null,
  onUpdated: () => void
}) {
  const [activity, setActivity] = useState('');
  const [energyChange, setEnergyChange] = useState<number>(0);
  const [summary, setSummary] = useState(profile?.currentSummary || '');
  const [showLowEnergyMeme, setShowLowEnergyMeme] = useState(false);
  const [showZeroWarning, setShowZeroWarning] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);

  useEffect(() => {
    if (profile?.currentSummary && !summary) {
      setSummary(profile.currentSummary);
    }
  }, [profile]);

  useEffect(() => {
    if (score === 0) {
      setShowZeroWarning(true);
    } else {
      setShowZeroWarning(false);
    }

    if (score < 40 && score > 0) {
      setShowLowEnergyMeme(true);
    } else {
      setShowLowEnergyMeme(false);
    }
  }, [score]);

  const addActivity = () => {
    if (!activity) return;
    const newAct = { name: activity, value: energyChange, id: Date.now().toString() };
    setActivities([newAct, ...activities]);
    setActivity('');
    setEnergyChange(0);
  };

  const handleSaveSummary = async () => {
    if (!profile) {
      alert("System Error: No active profile found. Please re-login.");
      return;
    }
    setSavingSummary(true);
    try {
      const docRef = doc(db, 'users', profile.uid);
      await updateDoc(docRef, {
        currentEnergy: score,
        currentSummary: summary,
        lastUpdated: serverTimestamp()
      });

      // Simple query for history to avoid indexing requirements
      const historyQuery = query(
        collection(db, 'energyRecords'),
        where('userId', '==', profile.uid)
      );
      const historySnap = await getDocs(historyQuery);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const existingTodayDoc = historySnap.docs.find(d => d.data().date === todayStr);
      
      if (!existingTodayDoc) {
        await addDoc(collection(db, 'energyRecords'), {
          userId: profile.uid,
          date: todayStr,
          score: score,
          summary: summary,
          updatedAt: serverTimestamp()
        });
      } else {
        const historyDocRef = doc(db, 'energyRecords', existingTodayDoc.id);
        await updateDoc(historyDocRef, {
          score: score,
          summary: summary,
          updatedAt: serverTimestamp()
        });
      }

      alert('Vibe successfully broadcasted to the Social Zone! 🌍');
    } catch (err: any) {
      console.error(err);
      alert(`Save failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingSummary(false);
    }
  };

  return (
    <motion.div 
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-white z-[100] flex flex-col overflow-y-auto custom-scrollbar p-6 pt-12"
    >
      <header className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="p-3 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
          <ChevronLeft className="w-6 h-6 text-black" strokeWidth={3} />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tight">Daily Socalorie</h2>
        <div className="w-12"></div>
      </header>

      {/* Initial Score Input */}
      <div className="mb-8 p-6 bg-slate-50 border-4 border-black rounded-[32px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-black text-sm uppercase tracking-widest text-ink/40">Set Initial Energy</h3>
          <span className="font-black text-xl text-primary">{initialScore}%</span>
        </div>
        <input 
          type="range" min="0" max="100" 
          value={initialScore} 
          onChange={(e) => setInitialScore(parseInt(e.target.value))}
          className="w-full h-8 accent-black cursor-pointer"
        />
      </div>

      <div className="flex flex-col items-center mb-12 gap-8">
        <div className="flex items-end gap-6">
          <div className="battery-pill overflow-hidden">
            <motion.div 
              initial={{ height: 0 }} animate={{ height: `${Math.min(100, score)}%` }}
              className={`absolute bottom-1 left-1 right-1 rounded-xl ${score > 60 ? 'bg-success' : score >= 40 ? 'bg-warning' : 'bg-danger'} transition-all duration-1000`}
            ></motion.div>
          </div>
          <div className="flex flex-col justify-center">
             <span className="text-6xl font-black font-display leading-none">{score}</span>
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/40">Remaining</p>
          </div>
        </div>
      </div>

      <div className="space-y-8 flex-1">
        <div className="space-y-4 bg-white border-4 border-black p-6 rounded-[32px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h3 className="font-black text-xl flex items-center gap-2 uppercase tracking-tight">
            <ActivityIcon size={20} strokeWidth={3} />
            Input Activity
          </h3>
          <div className="space-y-3">
            <input 
              placeholder="What did you do?"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="w-full p-4 bg-slate-50 border-2 border-black rounded-2xl outline-none focus:bg-white font-bold transition-all placeholder:text-ink/20"
            />
            <div className="flex gap-3">
              <input 
                type="number"
                placeholder="+/- value"
                value={energyChange || ''}
                onChange={(e) => setEnergyChange(parseInt(e.target.value) || 0)}
                className="w-1/2 p-4 bg-slate-50 border-2 border-black rounded-2xl outline-none focus:bg-white font-bold"
              />
              <button 
                onClick={addActivity}
                className="w-1/2 bg-black text-white font-black uppercase tracking-widest rounded-2xl shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-black text-[10px] text-ink/40 uppercase tracking-[0.3em] px-2 text-center">Energy Timeline</h3>
          <div className="space-y-3">
            <AnimatePresence>
              {activities.map(act => (
                <motion.div 
                  key={act.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="p-4 bg-white border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <span className="font-black text-sm uppercase tracking-tight">{act.name}</span>
                  <span className={`font-black px-3 py-1 rounded-lg border-2 border-black ${act.value >= 0 ? 'bg-success' : 'bg-danger'}`}>
                    {act.value >= 0 ? '+' : ''}{act.value}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {profile?.currentSummary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 bg-secondary/5 border-2 border-secondary/20 rounded-[2.5rem] flex flex-col gap-3 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-2 opacity-5"><Users size={48} /></div>
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Currently Broadcasting to Squad</span>
             </div>
             <p className="text-sm italic font-bold text-ink/60 px-2 line-clamp-2">"{profile.currentSummary}"</p>
          </motion.div>
        )}

        <div className="space-y-4 pt-4 mb-20">
          <h3 className="font-black text-[10px] text-ink/40 uppercase tracking-[0.3em] px-2 text-center">Feeling Summary</h3>
          <div className="space-y-4">
            <textarea 
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summarise your vibe today..."
              className="w-full p-6 bg-white border-4 border-black rounded-[32px] outline-none min-h-[120px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] font-bold text-lg italic placeholder:not-italic placeholder:text-ink/20"
            />
            <button 
              onClick={handleSaveSummary}
              disabled={savingSummary}
              className="w-full py-4 bg-black text-white border-4 border-black rounded-2xl font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-50"
            >
              {savingSummary ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </div>
      </div>

      {/* Zero Energy Warning Popup */}
      <AnimatePresence>
        {showZeroWarning && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-x-6 top-1/2 -translate-y-1/2 p-10 bg-danger border-4 border-black rounded-[40px] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] z-[120] text-center space-y-6"
          >
            <div className="text-8xl animate-pulse">💀</div>
            <div className="space-y-3">
              <h4 className="font-black text-3xl uppercase italic leading-none">Total Blackout</h4>
              <p className="text-xs font-black uppercase tracking-widest text-black/60 leading-relaxed">
                You have reached 0 energy. Shutting down all social protocols. Please go hibernate immediately!
              </p>
            </div>
            <button 
              onClick={() => setShowZeroWarning(false)}
              className="w-full py-4 bg-black text-white border-2 border-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-transform"
            >
              Acknowledged
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Low Energy Meme Popup */}
      <AnimatePresence>
        {showLowEnergyMeme && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-x-6 bottom-24 p-6 bg-primary border-4 border-black rounded-[32px] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] z-[110] flex items-center gap-6"
          >
            <div className="text-5xl animate-bounce shrink-0">😴</div>
            <div className="space-y-2">
              <h4 className="font-black text-lg uppercase tracking-tight leading-none italic">Battery Critically Low!</h4>
              <p className="text-[10px] font-black uppercase tracking-widest text-black/60 leading-relaxed">
                You're running on fumes, squad. Take a break before you shut down!
              </p>
              <img 
                src="https://picsum.photos/seed/tired/200/120?grayscale&blur=1" 
                alt="Tired Meme" 
                className="w-full rounded-xl border-2 border-black mt-2 grayscale hover:grayscale-0 transition-all cursor-pointer"
                referrerPolicy="no-referrer"
              />
            </div>
            <button 
              onClick={() => setShowLowEnergyMeme(false)}
              className="absolute -top-3 -right-3 w-10 h-10 bg-black text-white rounded-full border-2 border-white flex items-center justify-center font-black"
            >
              <X size={20} strokeWidth={3} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EmotionRecordDetail({ onBack, currentScore, userId }: { onBack: () => void, currentScore: number, userId: string }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [history, setHistory] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'energyRecords'),
      where('userId', '==', userId),
      orderBy('date', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Record<string, number> = {};
      snapshot.docs.forEach(d => {
        const record = d.data() as EnergyRecord;
        data[record.date] = record.score;
      });
      setHistory(data);
    });
    return () => unsubscribe();
  }, [userId]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const mergedHistory = { ...history, [todayKey]: currentScore };

  const getScoreColorClass = (score?: number) => {
    if (score === undefined) return 'bg-slate-100';
    if (score > 60) return 'bg-emerald-500 text-white';
    if (score >= 40) return 'bg-amber-500 text-white';
    return 'bg-rose-500 text-white';
  };

  const days = eachDayOfInterval({ 
    start: startOfMonth(new Date()), 
    end: endOfMonth(new Date()) 
  });

  // Logic for meme
  const last4Days = [
    format(new Date(), 'yyyy-MM-dd'),
    format(new Date(Date.now() - 86400000), 'yyyy-MM-dd'),
    format(new Date(Date.now() - 172800000), 'yyyy-MM-dd'),
    format(new Date(Date.now() - 259200000), 'yyyy-MM-dd'),
  ];
  const isRedStreak = last4Days.every(d => (mergedHistory[d] || 100) < 40);

  return (
    <motion.div 
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-page-bg z-[100] flex flex-col p-6 pt-12 overflow-y-auto custom-scrollbar"
    >
      <header className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="p-3 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
          <ChevronLeft className="w-6 h-6 text-black" strokeWidth={3} />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tight">Record</h2>
        <div className="w-12"></div>
      </header>

      <div className="bg-white border-4 border-black p-6 rounded-[2.5rem] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-8">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-black uppercase tracking-widest italic">{format(new Date(), 'MMMM yyyy')}</h3>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[10px] font-black text-ink/20 uppercase py-2">{d}</div>
          ))}
          {Array(startOfMonth(new Date()).getDay()).fill(0).map((_, i) => <div key={`empty-${i}`} />)}
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const score = mergedHistory[dateStr];
            return (
              <div 
                key={dateStr}
                className={`aspect-square rounded-xl flex items-center justify-center text-xs font-black border-2 border-black/5 transition-all ${getScoreColorClass(score)} ${isSameDay(day, new Date()) ? 'border-black border-2 ring-4 ring-primary/20 scale-110 z-10' : ''}`}
              >
                {format(day, 'd')}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pb-12">
        <div className={`p-8 rounded-[3rem] border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex items-center gap-6 ${isRedStreak ? 'bg-amber-100' : 'bg-[#FFF9C4]'}`}>
          <div className="text-6xl group-hover:animate-bounce">
            {isRedStreak ? '😿' : '😸'}
          </div>
          <div>
            <h4 className="text-xl font-black uppercase tracking-tighter mb-1 italic">
              {isRedStreak ? "Why you do this?" : "I can do this all day!"}
            </h4>
            <p className="text-[10px] font-black text-ink/40 uppercase tracking-widest leading-relaxed">
              {isRedStreak ? "Go treat yourself. Do you want to eat xcDonald's?" : "Keep that energy up, champ!"}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FriendEnergyDetail({ onBack, userProfile, currentEnergy, onRefresh }: { onBack: () => void, userProfile: UserProfile | null, currentEnergy: number, onRefresh: () => void }) {
  const [friends, setFriends] = useState<any[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'idle' | 'searching' | 'sent' | 'error'>('idle');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    onRefresh();
    if (!userProfile) return;

    fetchFriends();

    // Set up live friendships listener for search buttons and list
    const q1 = query(collection(db, 'friendships'), where('senderUid', '==', userProfile.uid));
    const q2 = query(collection(db, 'friendships'), where('receiverUid', '==', userProfile.uid));

    const unsub1 = onSnapshot(q1, (snap) => {
      setFriendships(prev => {
        const others = prev.filter(f => !snap.docs.some(d => d.id === f.id));
        const current = snap.docs.map(d => ({id: d.id, ...d.data()} as Friendship));
        return [...others, ...current];
      });
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      setFriendships(prev => {
        const others = prev.filter(f => !snap.docs.some(d => d.id === f.id));
        const current = snap.docs.map(d => ({id: d.id, ...d.data()} as Friendship));
        return [...others, ...current];
      });
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [userProfile]);

  // Re-fetch friend user details when friendships status changes
  useEffect(() => {
    if (userProfile && friendships.some(f => f.status === 'accepted')) {
      fetchFriends();
    }
  }, [friendships]);

  const fetchFriends = async () => {
    if (!userProfile) return;
    try {
      // Fetch where sender or receiver is user and status is accepted
      const q1 = query(collection(db, 'friendships'), where('senderUid', '==', userProfile.uid), where('status', '==', 'accepted'));
      const q2 = query(collection(db, 'friendships'), where('receiverUid', '==', userProfile.uid), where('status', '==', 'accepted'));
      
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const friendIds = [
        ...snap1.docs.map(d => d.data().receiverUid),
        ...snap2.docs.map(d => d.data().senderUid)
      ];

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      // Fetch user details for each friend
      const friendsData = await Promise.all(friendIds.map(async (fId) => {
        const uDoc = await getDoc(doc(db, 'users', fId));
        if (uDoc.exists()) {
          const data = uDoc.data();
          return {
            id: fId,
            username: data.username,
            score: data.currentEnergy || 0,
            summary: data.currentSummary || 'No summary',
            pic: data.profilePicUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${fId}`
          };
        }
        return null;
      }));

      setFriends(friendsData.filter(Boolean));
    } catch (err) {
      console.error("Error fetching friends:", err);
    }
  };

  const handleSearch = async (val: string) => {
    setSearch(val);
    if (val.length < 3) {
      setSearchResults([]);
      setStatus('idle');
      return;
    }

    setStatus('searching');
    try {
      // Search by email
      const qEmail = query(collection(db, 'users'), where('email', '==', val.toLowerCase()));
      const snapEmail = await getDocs(qEmail);
      
      // Search by username
      const qUser = query(collection(db, 'users'), where('username', '==', val.toLowerCase()));
      const snapUser = await getDocs(qUser);

      const results = [...snapEmail.docs, ...snapUser.docs].map(d => ({
        id: d.id,
        ...d.data(),
        score: (d.data() as any).currentEnergy || 0,
        summary: (d.data() as any).currentSummary || 'No status',
        pic: (d.data() as any).profilePicUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${d.id}`
      }));

      // Deduplicate
      const uniqueResults = results.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      const filtered = uniqueResults.filter(r => r.id !== userProfile?.uid);
      setSearchResults(filtered);
      setStatus(filtered.length === 0 ? 'error' : 'idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  const sendFriendRequest = async (targetUserId: string) => {
    if (!userProfile) return;
    try {
      // Check if already exists
      const existing = friendships.find(f => 
        (f.senderUid === userProfile.uid && f.receiverUid === targetUserId) ||
        (f.senderUid === targetUserId && f.receiverUid === userProfile.uid)
      );
      
      if (existing) {
        if (existing.status === 'accepted') alert('You are already squadmates!');
        else alert('Squad request is already pending!');
        return;
      }

      const friendshipId = `${userProfile.uid}_${targetUserId}`;
      const friendshipRef = doc(db, 'friendships', friendshipId);
      
      await setDoc(friendshipRef, {
        senderUid: userProfile.uid,
        receiverUid: targetUserId,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Create notification for target user
      await addDoc(collection(db, 'notifications'), {
        userId: targetUserId,
        senderUid: userProfile.uid,
        fromUserName: userProfile.username,
        type: 'friend_request',
        message: `${userProfile.username} wants to squad up!`,
        status: 'unread',
        createdAt: serverTimestamp()
      });

      alert('Squad request sent!');
    } catch (err) {
      console.error("Error sending friend request:", err);
      alert('Could not send invite.');
    }
  }; 

  const getFriendshipStatus = (otherId: string) => {
    const f = friendships.find(f => 
      (f.senderUid === userProfile?.uid && f.receiverUid === otherId) ||
      (f.senderUid === otherId && f.receiverUid === userProfile?.uid)
    );
    return f?.status || null;
  };
  const displayList = userProfile ? [
    { 
      id: userProfile.uid, 
      username: `${userProfile.username}`, 
      score: currentEnergy, 
      summary: userProfile.currentSummary || 'No summary today yet...', 
      pic: userProfile.profilePicUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.uid}`,
      isUser: true
    },
    ...friends
  ] : friends;

  const handleInvite = async () => {
    // Legacy handleInvite replaced by handleSearch and sendFriendRequest
  };

  return (
    <motion.div 
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-0 bg-page-bg z-[100] flex flex-col p-6 pt-12 overflow-hidden"
    >
      <header className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="p-3 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
          <ChevronLeft className="w-6 h-6 text-black" strokeWidth={3} />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tight">Social Zone</h2>
        <div className="w-12"></div>
      </header>

      {/* Global Search Bar */}
      <div className="mb-8 relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/20 group-hover:text-primary transition-colors" size={20} strokeWidth={3} />
        <input 
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full p-5 pl-14 bg-white border-4 border-black rounded-[2rem] outline-none font-bold shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] focus:shadow-none focus:translate-x-1 focus:translate-y-1 transition-all placeholder:text-ink/10 placeholder:font-black placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest"
        />
      </div>

      {searchResults.length > 0 && (
        <div className="mb-8 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-2 px-2 italic text-center underline decoration-black underline-offset-4">Found Squad</h3>
          {searchResults.map(res => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              key={res.id} 
              className="p-5 bg-white border-4 border-black rounded-[2rem] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl border-2 border-black overflow-hidden bg-white shadow-sm">
                  <img src={res.pic} alt={res.username} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-black text-ink uppercase text-sm tracking-tight">@{res.username}</h4>
                  <p className="text-[8px] font-black text-ink/40 uppercase tracking-widest leading-none">Scouted Unit</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getFriendshipStatus(res.id) === 'pending' ? (
                  <span className="px-4 py-2 bg-slate-100 border-2 border-black rounded-xl font-black uppercase text-[10px] text-ink/30 italic">
                    Pending
                  </span>
                ) : getFriendshipStatus(res.id) === 'accepted' ? (
                  <span className="px-4 py-2 bg-success border-2 border-black rounded-xl font-black uppercase text-[10px] text-ink italic">
                    Squadmate
                  </span>
                ) : (
                  <button 
                    onClick={() => sendFriendRequest(res.id)}
                    className="px-4 py-2 bg-primary border-2 border-black rounded-xl font-black uppercase text-[10px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
                  >
                    Add
                  </button>
                )}
              </div>
            </motion.div>
          ))}
          <div className="h-4 border-b-4 border-black/5 mx-10"></div>
        </div>
      )}

      {status === 'error' && search.length >= 3 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 p-6 bg-rose-50 border-4 border-black rounded-[2rem] flex flex-col items-center justify-center text-center gap-2 shadow-[6px_6px_0px_0px_rgba(255,107,107,0.2)]">
          <Frown size={32} className="text-danger" />
          <div>
            <h4 className="font-black uppercase text-sm text-danger">Cannot find this user</h4>
            <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">Check the username or email again</p>
          </div>
        </motion.div>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-1 pb-20">
        {displayList.map(friend => (
          <div key={friend.id} className={`p-6 border-4 border-black rounded-[32px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-4 group transition-all ${'isUser' in friend ? 'bg-primary/20 bg-gradient-to-br from-primary/10 to-transparent' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl border-2 border-black overflow-hidden shadow-md">
                  <img src={friend.pic} alt={friend.username} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-black text-ink uppercase text-lg tracking-tight">@{friend.username}</h4>
                  <p className="text-[10px] font-black text-ink uppercase tracking-[0.2em]">{('isUser' in friend) ? '✨ Your Live Vibe' : 'Active squad'}</p>
                </div>
              </div>
              <div className={`px-4 py-2 rounded-xl border-2 border-black font-black text-sm ${friend.score > 60 ? 'bg-success' : friend.score >= 40 ? 'bg-warning' : 'bg-danger'}`}>
                {friend.score}%
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border-2 border-black/5 italic text-sm text-ink/60 font-bold leading-relaxed px-5">
              "{friend.summary}"
            </div>
          </div>
        ))}
        {friends.length === 0 && (
           <div className="py-12 border-4 border-dashed border-black/10 rounded-[32px] flex flex-col items-center justify-center text-center gap-4">
             <div className="w-16 h-16 bg-white border-2 border-dashed border-black/10 rounded-2xl flex items-center justify-center text-black/10">
               <Users size={32} />
             </div>
             <div>
               <h4 className="font-black uppercase text-sm text-ink/20">Your squad is empty</h4>
               <p className="text-[10px] font-bold text-ink/10 uppercase tracking-[0.2em]">Add friends to see their vibes</p>
             </div>
           </div>
        )}
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-white border-4 border-black rounded-[40px] p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] space-y-8 relative"
            >
              <button 
                onClick={() => { setShowInvite(false); setStatus('idle'); }} 
                className="absolute top-6 right-6 p-2 text-ink/20 hover:text-ink transition-colors"
              >
                <X size={28} strokeWidth={3} />
              </button>
              
              <div>
                <h3 className="text-3xl font-black uppercase tracking-tight italic">Invite Squad</h3>
                <p className="text-xs font-bold text-ink/30 uppercase tracking-[0.2em] mt-1">Grow your zone</p>
              </div>
              
              <div className="space-y-4">
                <div className="relative">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/20" size={20} strokeWidth={3} />
                  <input 
                    placeholder="E.g. alex@vibe.com"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full p-4 pl-12 bg-slate-50 border-2 border-black outline-none rounded-2xl font-bold transition-all focus:bg-white"
                  />
                </div>
                
                {status === 'sent' && (
                  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="p-4 bg-emerald-100 border-2 border-black text-black rounded-2xl text-center font-black uppercase text-xs flex items-center justify-center gap-2">
                    <Check size={18} strokeWidth={3} /> Invitation sent!
                  </motion.div>
                )}
                
                {status === 'error' && (
                  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="p-4 bg-rose-100 border-4 border-black text-black rounded-2xl text-center font-black uppercase text-xs flex flex-col items-center justify-center gap-1 shadow-[4px_4px_0px_0px_rgba(255,107,107,0.2)]">
                    <div className="flex items-center gap-2">
                       <Frown size={18} strokeWidth={3} /> 
                       <span>Unable to find this user</span>
                    </div>
                    <span className="text-[8px] opacity-40">Please check the email again</span>
                  </motion.div>
                )}

                <button 
                  onClick={handleInvite}
                  disabled={status === 'searching'}
                  className="w-full py-4 bg-primary border-4 border-black text-ink rounded-2xl font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-50"
                >
                  {status === 'searching' ? 'Searching...' : 'Send Vibe'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function NotificationsView({ notifications, userProfile, onRefresh }: { notifications: Notification[], userProfile: UserProfile | null, onRefresh: () => void }) {
  const handleAccept = async (notif: Notification) => {
    if (!userProfile || !notif.senderUid) return;
    try {
      // 1. Update friendship
      const friendshipId = `${notif.senderUid}_${userProfile.uid}`;
      const friendshipRef = doc(db, 'friendships', friendshipId);
      await updateDoc(friendshipRef, { status: 'accepted' });

      // 2. Clear notification
      await deleteDoc(doc(db, 'notifications', notif.id));

      // 3. Create reciprocal friendship doc for easier querying? 
      // Actually my query looks for sender OR receiver, so one doc is fine.

      alert('Squad confirmed!');
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDecline = async (notif: Notification) => {
    if (!userProfile || !notif.senderUid) return;
    try {
      const friendshipId = `${notif.senderUid}_${userProfile.uid}`;
      await deleteDoc(doc(db, 'friendships', friendshipId));
      await deleteDoc(doc(db, 'notifications', notif.id));
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 pt-12 space-y-8 overflow-y-auto custom-scrollbar mb-24">
      <header>
        <h1 className="text-4xl font-black uppercase tracking-tight italic">Alerts</h1>
        <p className="text-[10px] text-ink/30 font-black uppercase tracking-[0.3em] mt-1">Squad noise & news</p>
      </header>

      <div className="flex-1 space-y-6">
        {notifications.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-12 gap-4">
            <Bell size={48} className="opacity-10" />
            <span className="font-black uppercase text-xs tracking-widest text-ink/20">Quiet Zone</span>
          </div>
        ) : (
          notifications.map(notif => (
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              key={notif.id} 
              className={`p-6 bg-white border-4 border-black rounded-[32px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-4 ${notif.type === 'friend_request' ? 'border-primary' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border-2 border-black ${notif.type === 'friend_request' ? 'bg-primary text-ink' : 'bg-[#FAF9F6] text-ink/40'}`}>
                  {notif.type === 'friend_request' ? 'Squad Invite' : 'System Log'}
                </span>
                <span className="text-[10px] font-black text-ink/20 tracking-widest">{notif.createdAt ? format(notif.createdAt.toDate(), 'HH:mm') : ''}</span>
              </div>
              <p className="font-bold text-ink text-lg italic leading-tight">"{notif.message}"</p>
              {notif.type === 'friend_request' && (
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => handleAccept(notif)}
                    className="flex-1 py-3 bg-black text-white rounded-2xl font-black uppercase text-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                  >
                    Accept
                  </button>
                  <button 
                    onClick={() => handleDecline(notif)}
                    className="flex-1 py-3 bg-white border-2 border-black rounded-2xl font-black uppercase text-xs active:translate-x-[2px] active:translate-y-[2px]"
                  >
                    Decline
                  </button>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function UserProfileView({ profile, onUpdated, navigateTo }: { profile: UserProfile | null, onUpdated: () => void, navigateTo: (view: ViewState) => void }) {
  if (!profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
        <Frown size={48} className="text-ink/10" />
        <p className="font-black uppercase text-xs text-ink/20">Profile not identified</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-black text-white rounded-xl font-black uppercase text-[10px]">Retry Sync</button>
      </div>
    );
  }

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile?.username || '');
  const [editPic, setEditPic] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [vitals, setVitals] = useState({ streak: 0, events: 0 });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (profile) setEditName(profile.username);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    
    const fetchVitals = async () => {
      try {
        // 1. Fetch activities count
        const actQuery = query(collection(db, 'activities'), where('userId', '==', profile.uid));
        const actSnap = await getDocs(actQuery);
        const eventsCount = actSnap.size;

        // 2. Fetch energy records for streak - simplified query to avoid indexing issues
        const recQuery = query(
          collection(db, 'energyRecords'), 
          where('userId', '==', profile.uid)
        );
        const recSnap = await getDocs(recQuery);
        const records = recSnap.docs.map(d => d.data());
        
        let streak = 0;
        // Sort in memory to avoid needing a composite index
        const uniqueDates = Array.from(new Set(records.map(r => r.date).filter(Boolean)))
          .sort((a: any, b: any) => b.localeCompare(a));
        
        if (uniqueDates.length > 0) {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

          if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
            streak = 1;
            for (let i = 0; i < uniqueDates.length - 1; i++) {
              const d1 = new Date(uniqueDates[i] as string);
              const d2 = new Date(uniqueDates[i+1] as string);
              const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
              if (diff === 1) {
                streak++;
              } else {
                break;
              }
            }
          }
        }

        setVitals({ streak, events: eventsCount });
      } catch (err) {
        console.error("Vitals error:", err);
      }
    };

    fetchVitals();
  }, [profile]);

  const handlePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditPic(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'users', profile.uid);
      await updateDoc(docRef, {
        username: editName,
        profilePicUrl: editPic || profile.profilePicUrl
      });
      setIsEditing(false);
      onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

const handleLogout = () => {
    localStorage.removeItem('socalorie_uid');
    logout();
    navigateTo('landing');
  };

  const handleNoLogout = () => {
    setShowLogoutConfirm(false);
    navigateTo('home');
  };

  return (
    <div className="flex-1 p-6 pt-12 space-y-12 overflow-y-auto custom-scrollbar mb-24">
      <header className="flex justify-between items-center">
        <h1 className="text-4xl font-black uppercase tracking-tight italic">User</h1>
        <div className="flex gap-3">
          {isEditing && (
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="p-3 bg-success border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
            >
              {saving ? <div className="w-6 h-6 border-2 border-black border-t-transparent animate-spin rounded-full" /> : <Check size={24} strokeWidth={3} />}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col items-center gap-10">
        <div className="relative group">
          <div className="w-36 h-36 rounded-[40px] bg-white border-4 border-black overflow-hidden shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] ring-8 ring-white transform -rotate-3 hover:rotate-0 transition-transform">
            <img src={editPic || profile?.profilePicUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.uid}`} alt="Profile" className="w-full h-full object-cover" />
          </div>
          <button 
            onClick={() => setIsEditing(true)}
            className="absolute -bottom-2 -right-2 p-3 bg-primary border-4 border-black text-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:scale-110 active:scale-95 transition-transform"
          >
            {isEditing ? (
              <label className="cursor-pointer">
                <Plus size={20} strokeWidth={3} />
                <input type="file" className="hidden" accept="image/*" onChange={handlePicUpload} />
              </label>
            ) : (
              <Edit2 size={20} strokeWidth={3} />
            )}
          </button>
        </div>

        <div className="text-center space-y-4 w-full max-w-[280px]">
           {isEditing ? (
             <div className="space-y-4">
               <input 
                 value={editName}
                 onChange={(e) => setEditName(e.target.value)}
                 className="w-full p-4 bg-slate-50 border-4 border-black rounded-2xl text-center font-black uppercase text-xl outline-none focus:bg-white"
                 placeholder="Username"
               />
               <button 
                 onClick={() => { setIsEditing(false); setEditPic(null); }}
                 className="text-[10px] font-black uppercase tracking-widest text-ink/30 hover:text-ink transition-colors"
               >
                 Cancel Session Edit
               </button>
             </div>
           ) : (
             <>
               <h2 
                 onClick={() => setIsEditing(true)}
                 className="text-3xl font-black uppercase tracking-tight italic flex items-center justify-center gap-3 cursor-pointer hover:text-primary transition-colors"
               >
                 {profile?.username}
                 <Edit2 size={16} className="text-ink/20" />
               </h2>
               <p className="text-ink/40 font-black uppercase text-[10px] tracking-[0.3em]">{profile?.email}</p>
             </>
           )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white border-4 border-black p-8 rounded-[40px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-6 text-ink">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-ink/20 text-center">Account Vitals</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 border-2 border-black/5 p-4 rounded-3xl text-center">
              <span className="block text-3xl font-black italic">{vitals.streak}</span>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink/20 mt-1 block">Day Streak</span>
            </div>
            <div className="bg-slate-50 border-2 border-black/5 p-4 rounded-3xl text-center">
              <span className="block text-3xl font-black italic">{vitals.events}</span>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink/20 mt-1 block">Events</span>
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => setShowLogoutConfirm(true)} className="w-full py-5 bg-danger border-4 border-black text-white rounded-[32px] font-black uppercase tracking-[0.2em] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center gap-3">
        Kill Session <LogOut size={24} strokeWidth={3} />
      </button>

      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-white border-4 border-black rounded-[40px] p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] space-y-8 text-center"
            >
              <div className="w-20 h-20 bg-danger/10 text-danger rounded-[30px] border-4 border-black flex items-center justify-center mx-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <AlertCircle size={40} strokeWidth={3} />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-3xl font-black uppercase tracking-tight italic">Kill Session?</h3>
                <p className="text-sm font-bold text-ink/40 uppercase tracking-widest leading-relaxed">Are you sure you want to terminate your current energy record session?</p>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleLogout}
                  className="w-full py-5 bg-danger border-4 border-black text-white rounded-[24px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                >
                  Yes, Sign Out
                </button>
                <button 
                  onClick={handleNoLogout}
                  className="w-full py-5 bg-white border-4 border-black text-ink rounded-[24px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:bg-slate-50 transition-all"
                >
                  No, Go Back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SHARED COMPONENTS ---

function Toolbar({ currentView, navigateTo, unreadCount }: { currentView: ViewState, navigateTo: (view: ViewState) => void, unreadCount: number }) {
  const hiddenOn = ['landing', 'login', 'register', 'register-profile', 'welcome-back', 'welcome-new', 'daily-detail', 'emotion-detail', 'friend-detail'];
  if (hiddenOn.includes(currentView)) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm h-20 bg-black rounded-full px-8 flex items-center justify-between z-50 shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
      <Tab icon={<Home />} label="Home" active={currentView === 'home'} onClick={() => navigateTo('home')} />
      <Tab 
        icon={<Bell />} 
        label="Alerts" 
        active={currentView === 'notifications'} 
        onClick={() => navigateTo('notifications')} 
        badge={unreadCount > 0 ? unreadCount : undefined}
      />
      <Tab icon={<User />} label="User" active={currentView === 'profile'} onClick={() => navigateTo('profile')} />
    </div>
  );
}

function Tab({ icon, label, active, onClick, badge }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, badge?: number }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1 group transition-all active:scale-90">
      <div className={`p-2 transition-all duration-300 ${active ? 'text-success scale-110' : 'text-white/50 group-hover:text-white'}`}>
        {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: active ? 3 : 2 })}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-tighter transition-colors ${active ? 'text-success' : 'text-white/30'}`}>
        {label}
      </span>
      {badge !== undefined && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-black text-[10px] font-black rounded-full flex items-center justify-center border-2 border-black">
          {badge}
        </span>
      )}
    </button>
  );
}
