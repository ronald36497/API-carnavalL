// --- IMPORTAÇÕES DIRETAS (A MÁGICA DA VERCEL) ---
// Ao usar require, a Vercel garante que esses arquivos existam no servidor
const blocosData = require("../scripts/BlocoRefinado.json");
const banheirosData = require("../scripts/BanheiroRefinado.json");
const hospitaisData = require("../scripts/HospitalRefinado.json");

// Lógica para os Blocos
exports.getBlocos = (req, res) => {
  try {
    // Usamos os dados carregados lá em cima
    const { bairro } = req.query;

    if (bairro) {
      const filtrados = blocosData.filter((b) =>
        b.bairro.toLowerCase().includes(bairro.toLowerCase()),
      );
      return res.json(filtrados);
    }

    res.json(blocosData);
  } catch (error) {
    console.error("Erro blocos:", error);
    res.status(500).json({ error: "Erro ao ler blocos" });
  }
};

// Lógica para os Banheiros
exports.getBanheiros = (req, res) => {
  try {
    res.json(banheirosData);
  } catch (error) {
    console.error("Erro banheiros:", error);
    res.status(500).json({ error: "Erro ao ler banheiros" });
  }
};

// Lógica para os Hospitais
exports.getHospitais = (req, res) => {
  try {
    res.json(hospitaisData);
  } catch (error) {
    console.error("Erro hospitais:", error);
    res.status(500).json({ error: "Erro ao ler hospitais" });
  }
};
