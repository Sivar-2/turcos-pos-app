import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// --------------------------------------------------------
// CONFIGURACIÓN DE FIREBASE
// Tienes que reemplazar esto con tus llaves reales de la consola de Firebase.
// --------------------------------------------------------
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBfXvY1vyeuW4Xg75oAp7EPZhp9In5ZJyQ",
    authDomain: "turcos-pos.firebaseapp.com",
    projectId: "turcos-pos",
    storageBucket: "turcos-pos.firebasestorage.app",
    messagingSenderId: "88897832106",
    appId: "1:88897832106:web:9a0f68fa56204928907cd3",
    measurementId: "G-XLBWCEZ8VF"
};
// State to track initialization
let db = null;
let app = null;
let isConfigured = false;

if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    const auth = getAuth(app);

    // Auto-login anonymously for simplicity
    signInAnonymously(auth).catch(console.error);

    // Enable offline persistence
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.warn('Persistence not supported by browser');
        }
    });
    isConfigured = true;
} else {
    console.warn("Firebase config missing. Running in LOCAL ONLY mode.");
}

// Helper to save order
export async function saveOrderToFirebase(order) {
    if (!isConfigured || !db) {
        // Fallback: Just return true so app continues (Local storage handles the rest)
        return { success: false, reason: 'no-config' };
    }

    try {
        await addDoc(collection(db, 'orders'), {
            ...order,
            timestamp: serverTimestamp(),
            Synced: true
        });
        return { success: true };
    } catch (e) {
        console.error("Error saving to Firestore:", e);
        return { success: false, error: e };
    }
}
