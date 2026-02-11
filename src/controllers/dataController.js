const fs = require("fs");
const path = require("path");

// Função auxiliar para ler os arquivos JSON
const readJson = (fileName) => {
  const filePath = path.join(__dirname, "..", "scripts", fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

// Lógica para os Blocos
exports.getBlocos = (req, res) => {
  try {
    const blocos = readJson("BlocoRefinado.json");
    const { bairro } = req.query;

    if (bairro) {
      const filtrados = blocos.filter((b) =>
        b.bairro.toLowerCase().includes(bairro.toLowerCase()),
      );
      return res.json(filtrados);
    }
    res.json(blocos);
  } catch (error) {
    res.status(500).json({ error: "Erro ao ler blocos" });
  }
};

// Lógica para os Banheiros
exports.getBanheiros = (req, res) => {
  try {
    const banheiros = readJson("BanheiroRefinado.json");
    res.json(banheiros);
  } catch (error) {
    res.status(500).json({ error: "Erro ao ler banheiros" });
  }
};

// Lógica para os Hospitais
exports.getHospitais = (req, res) => {
  try {
    const hospitais = readJson("HospitalRefinado.json");
    res.json(hospitais);
  } catch (error) {
    res.status(500).json({ error: "Erro ao ler hospitais" });
  }
};
