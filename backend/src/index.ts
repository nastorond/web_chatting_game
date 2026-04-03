import express from "express";
import cors from "cors";
import joinRouter from "./routes/join";
import stateRouter from "./routes/state";
import actionRouter from "./routes/action";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  credentials: true,
}));

app.use(express.json());

// Docker 헬스체크용
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.use(joinRouter);
app.use(stateRouter);
app.use(actionRouter);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Backend] Game server running on port ${PORT}`);
});
