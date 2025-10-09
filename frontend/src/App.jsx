// import React from "react";
// import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
// import Login from "./pages/Login.jsx";
// import Dashboard from "./pages/Dashboard.jsx";

// function Router() {
//   const { user } = useAuth();
//   return user ? <Dashboard /> : <Login />;
// }

// export default function App() {
//   return (
//     <AuthProvider>
//       <Router />
//     </AuthProvider>
//   );
// }

import React from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import { CamerasProvider } from "./store/cameras.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";

function Router() {
  const { user, token } = useAuth();

  // If not logged in yet, show Login page
  if (!user || !token) {
    return <Login />;
  }

  // Once logged in, wrap the dashboard with CamerasProvider
  return (
    <CamerasProvider token={token}>
      <Dashboard />
    </CamerasProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
