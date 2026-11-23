import React from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider, useMsal } from '@azure/msal-react';
import App from './App';
import './styles.css';

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined;
const apiScope = import.meta.env.VITE_ENTRA_API_SCOPE as string | undefined;
const msal = clientId && tenantId ? new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin
  },
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
}) : undefined;

function AuthenticatedApp() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [token, setToken] = React.useState<string>();
  const [authError, setAuthError] = React.useState('');

  React.useEffect(() => {
    if (!account) { setToken(undefined); return; }
    if (!apiScope) { setToken(undefined); setAuthError('Configure VITE_ENTRA_API_SCOPE para solicitar acceso a la API.'); return; }
    instance.acquireTokenSilent({ account, scopes: [apiScope] })
      .then(result => setToken(result.accessToken))
      .catch(() => setToken(undefined));
  }, [account, instance]);

  return <App
    token={token}
    authError={authError}
    userName={account?.name}
    onSignIn={() => instance.loginRedirect({ scopes: apiScope ? [apiScope] : [] })}
    onSignOut={() => { setToken(undefined); instance.logoutRedirect(); }}
    onAuthError={setAuthError}
  />;
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <FluentProvider theme={webLightTheme}>
      {msal ? <MsalProvider instance={msal}><AuthenticatedApp /></MsalProvider> : <App />}
    </FluentProvider>
  </React.StrictMode>
);
