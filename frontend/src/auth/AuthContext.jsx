import React, { createContext, useContext, useState } from "react";

// Swap these stubs for AWS Amplify Auth later.
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const login = async ({ email }) => setUser({ email });
  const logout = async () => setUser(null);
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
