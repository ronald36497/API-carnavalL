const express = require("express");
const cors = require("cors");
const apiRoutes = require("./src/routes/apiRoutes");

const app = express();
// Permite qualquer origem (importante pro app mobile acessar)
app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

// Rota raiz para testar se subiu
app.get("/", (req, res) => {
  res.send("🎊 API Pula Zé rodando na Vercel!");
});

// --- MUDANÇA MÁGICA AQUI ---
// Só roda o listen se estiver LOCAL. Na Vercel, exportamos o app.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor local rodando: http://localhost:${PORT}`);
  });
}

module.exports = app;
