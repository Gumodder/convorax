import "dotenv/config";
import express from "express";
import cors from "cors";
import { AccessToken } from "livekit-server-sdk";

const app = express();
app.use(cors());


const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

app.get("/token", async (req, res) => {
  const room = req.query.room || "sala-teste";
  const name = req.query.name || "convidado";

  const at = new AccessToken(API_KEY, API_SECRET, { identity: name });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  const token = await at.toJwt();
  res.json({ token });
});

app.listen(process.env.PORT || 3001, () => console.log("Backend de tokens rodando na porta 3001"));
