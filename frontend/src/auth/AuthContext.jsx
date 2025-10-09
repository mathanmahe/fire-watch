// import React, { createContext, useContext, useState } from "react";

// // Swap these stubs for AWS Amplify Auth later.
// const AuthCtx = createContext(null);

// export function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const login = async ({ email }) => setUser({ email });
//   const logout = async () => setUser(null);
//   return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
// }

// export const useAuth = () => useContext(AuthCtx);

import React, { createContext, useContext, useState, useEffect } from "react";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // Load token & user from localStorage at startup
  useEffect(() => {
    const savedToken = localStorage.getItem("idToken");
    const savedEmail = localStorage.getItem("userEmail");
    if (savedToken && savedEmail) {
      setUser({ email: savedEmail });
      setToken(savedToken);
      console.log("🔐 Loaded existing token from localStorage");
    }
  }, []);

  // Simple manual login for now
  const login = async ({ email, idToken }) => {
    if (!idToken) {
      alert("Missing ID token");
      return;
    }
    localStorage.setItem("idToken", idToken);
    localStorage.setItem("userEmail", email);
    setUser({ email });
    setToken(idToken);
    console.log("✅ Logged in and stored token");
  };

  const logout = async () => {
    localStorage.removeItem("idToken");
    localStorage.removeItem("userEmail");
    setUser(null);
    setToken(null);
    console.log("🚪 Logged out");
  };

  return (
    <AuthCtx.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
