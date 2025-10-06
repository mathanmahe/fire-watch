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
        <h1>Fire Watch</h1>
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
