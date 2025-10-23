import { cfg } from "../config.js";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: cfg.cognito.poolId,
  tokenUse: "id",           // use "access" if your frontend sends access tokens
  clientId: cfg.cognito.clientId
});

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });
    const payload = await verifier.verify(token);
    req.user = { sub: payload.sub, email: payload.email };
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid token", detail: String(e) });
  }
}
