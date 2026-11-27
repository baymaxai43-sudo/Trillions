import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

export const GOOGLE_WEB_CLIENT_ID = '160713321951-3m81u5gkpsc6c12fhqn57gb0o4qb7cl5.apps.googleusercontent.com';

let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, scopes: ['email', 'profile'] });
  configured = true;
}

/** Native Google account picker -> ID token -> Supabase session. Returns false if the user cancelled. */
export async function signInWithGoogle(): Promise<boolean> {
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return false;
    const idToken = res.data.idToken ?? (await GoogleSignin.getTokens()).idToken;
    if (!idToken) throw new Error('Google did not return an ID token.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw error;
    return true;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return false;
      if (e.code === statusCodes.IN_PROGRESS) return false;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google Play services are not available on this device.');
      if (String(e.code) === '10' || /DEVELOPER_ERROR/i.test(e.message)) {
        throw new Error('Google sign-in is not configured for this app build (DEVELOPER_ERROR). Check the Android OAuth client SHA-1.');
      }
    }
    throw e;
  }
}

/** Clears the native Google session so the account picker shows next time. Never throws. */
export async function signOutGoogle() {
  try {
    configure();
    await GoogleSignin.signOut();
  } catch {}
}
