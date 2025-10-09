// import React, { useState } from "react";
// import { useAuth } from "../auth/AuthContext.jsx";

// export default function Login() {
//   const { login } = useAuth();
//   const [email, setEmail] = useState("");
//   const [pwd, setPwd] = useState("");

//   async function onSubmit(e) {
//     e.preventDefault();
//     await login({ email, pwd });
//   }

//   return (
//     <div className="login">
//       <div className="login-card">
//         <div className="login-brand">
//           <img
//             src="/images/fire-icon.png"
//             alt="FireWatch Logo"
//             className="login-logo"
//           />
//           <h1>FireWatch</h1>
//         </div>
//         <p className="sub">Sign in to continue</p>
//         <form className="login-form" onSubmit={onSubmit}>
//           <input
//             placeholder="Email"
//             value={email}
//             onChange={(e) => setEmail(e.target.value)}
//             required
//           />
//           <input
//             placeholder="Password"
//             type="password"
//             value={pwd}
//             onChange={(e) => setPwd(e.target.value)}
//             required
//           />
//           <button type="submit">Sign In</button>
//         </form>
//         <p className="hint">TODO: Link to Cognito</p>
//       </div>
//     </div>
//   );
// }

import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [idToken, setIdToken] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    login({ email, idToken });
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Manual Login (Temporary)</h2>
      <form onSubmit={handleSubmit}>
        <label>Email:</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <br />
        <label>ID Token:</label>
        <textarea
          rows={6}
          cols={80}
          value={idToken}
          onChange={(e) => setIdToken(e.target.value)}
          placeholder="Paste your Cognito ID token here"
          required
        />
        <br />
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
