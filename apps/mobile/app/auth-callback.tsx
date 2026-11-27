import { Redirect } from 'expo-router';

// Deep-link landing for OAuth (trillion://auth-callback). The auth screen finishes the exchange.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
