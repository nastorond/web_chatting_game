import express from "express";
import cors from "cors";
import roomRouter from "./routes/room";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || ["http://localhost:3000"],
  allowedHeaders: ["Content-Type", "X-Player-Token"],
}));

app.use(express.json({ limit: "16kb" }));

// Docker 헬스체크용
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.use(roomRouter);

// 잘못된 JSON 본문 등 라우터 밖에서 발생한 에러
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.error("[express]", err);
  res.status(status).json({ error: status >= 500 ? "서버 내부 오류가 발생했습니다." : "잘못된 요청입니다.", code: status >= 500 ? "INTERNAL" : "BAD_REQUEST" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Backend] Game server running on port ${PORT}`);
});
