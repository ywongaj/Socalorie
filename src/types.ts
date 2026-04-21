export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  profilePicUrl?: string;
  currentEnergy?: number;
  currentSummary?: string;
  lastUpdated?: any;
  createdAt: any;
}

export interface Activity {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  activityName: string;
  energyValue: number;
  createdAt: any;
}

export interface EnergyRecord {
  userId: string;
  date: string;
  score: number;
  summary?: string;
  updatedAt: any;
}

export interface Friendship {
  id: string;
  senderUid: string;
  receiverUid: string;
  status: 'pending' | 'accepted';
  createdAt: any;
}

export interface Notification {
  id: string;
  userId: string;
  fromUserId?: string;
  senderUid?: string;
  fromUserName?: string;
  type: 'friend_request' | 'system';
  message: string;
  status: 'unread' | 'read';
  createdAt: any;
}
