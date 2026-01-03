import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function logUserActivity(db, userId, type, meta = {}) {
  try {
    if (!db || !userId) return null;
    const ref = collection(db, 'userActivities');
    const docRef = await addDoc(ref, {
      userId,
      type,
      meta,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.warn('Failed to log user activity:', err);
    return null;
  }
}

export default { logUserActivity };