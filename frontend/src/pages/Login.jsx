import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    await login({ email, pwd });
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          <img
            src="/images/fire-icon.png"
            alt="Fire Watch Logo"
            className="login-logo"
          />
          <h1>FireWatch</h1>
        </div>
        <p className="sub">Sign in to continue</p>
        <form onSubmit={onSubmit}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="Password"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <button type="submit">Sign In</button>
        </form>
        <p className="hint">Hook this up to AWS Amplify/Cognito later.</p>
      </div>
    </div>
  );
}
