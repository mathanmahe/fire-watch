import React, { createContext, useContext, useState, useEffect } from "react";
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";
import { cameraApi } from "../services/cameraApi.js";

// Swap these stubs for AWS Amplify Auth later.
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();

      // Set token for API calls (use ID token for backend compatibility)
      cameraApi.setToken(session.tokens?.idToken?.toString());

      setUser({
        email: user.signInDetails?.loginId,
        sub: user.userId,
        username: user.username,
      });
    } catch (error) {
      console.log("No authenticated user:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async ({ email, password }) => {
    try {
      const { isSignedIn } = await signIn({ username: email, password });

      if (isSignedIn) {
        const user = await getCurrentUser();
        const session = await fetchAuthSession();

        cameraApi.setToken(session.tokens?.idToken?.toString());

        setUser({
          email: user.signInDetails?.loginId,
          sub: user.userId,
          username: user.username,
        });

        return { success: true };
      }

      return { success: false, error: "Authentication failed" };
    } catch (error) {
      console.error("Login failed:", error);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await signOut();
      cameraApi.clearToken();
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <AuthCtx.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
