// Creates the owner login in the local Auth emulator (admin@dairy.local / dairy123).
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';

const auth = getAuth(initializeApp({ apiKey: 'demo-key', projectId: 'demo-dairy' }));
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

try {
  await createUserWithEmailAndPassword(auth, 'admin@dairy.local', 'dairy123');
  console.log('Created local owner account admin@dairy.local / dairy123');
} catch (err) {
  if (err.code !== 'auth/email-already-in-use') throw err;
  console.log('Local owner account already exists');
}

