# Firebase Setup Guide

## Quick Start

Your site is now ready to sync data across devices with Firebase! Follow these steps:

### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project**
3. Enter a project name (e.g., "AOA-Operations")
4. Click **Create project**

### 2. Get Your Firebase Config
1. In your Firebase project, click the **Settings icon** ⚙️
2. Select **Project Settings**
3. Scroll to **Your apps** and click **Create app** (Web icon)
4. Register the app with a name (e.g., "AOA Web")
5. Copy the config object that appears

### 3. Update firebase.js
Replace the placeholder values in `firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};
```

### 4. Enable Firestore Database
1. In Firebase Console, go to **Build** → **Firestore Database**
2. Click **Create Database**
3. Start in **Test mode** (for development)
4. Choose a location near you
5. Click **Create**

### 5. Set Firestore Security Rules
In Firestore, go to **Rules** tab and replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow everyone to read/write (development only - restrict before production!)
    match /{document=**} {
      allow read, write;
    }
  }
}
```

Click **Publish**.

## How It Works

- **Fuel Discrepancies** data syncs to Firebase automatically when you add/delete reports
- Data is stored locally first (instant UI response) and synced to Firebase in the background
- If Firebase is unavailable, data falls back to localStorage
- All devices accessing the site will see the same data within seconds

## Next Steps

The fuel discrepancies page is already connected! Update other pages similarly:
- Add `import { loadCollectionData, saveCollectionData } from "./firebase.js";` at the top
- Replace `localStorage.setItem()` with `await saveCollectionData()`
- Replace `localStorage.getItem()` with `await loadCollectionData()`

## Security Note

⚠️ **Important**: Test mode allows anyone to read/write. Before going live, set up proper authentication or restrict rules to your domain.
