const fs = require("fs");
const path = require("path");
const { calculateDistance } = require("../utils/geoUtils");

const readJson = (fileName) => {
  try {
    // process.cwd() pega a raiz do projeto na Vercel
    const filePath = path.join(process.cwd(), "src", "scripts", fileName);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Erro ao ler ${fileName}:`, error);
    return []; // Retorna array vazio para não derrubar o servidor com erro 500
  }
};

exports.getBanheiros = (req, res) => {
  try {
    let banheiros = readJson("BanheiroRefinado.json");

    // Pegamos os parâmetros, incluindo lat, lng e raio para geolocalização
    const { qtd_minima, data, lat, lng, raio } = req.query;

    // 1. Filtro de Proximidade (Geolocalização)
    if (lat && lng && raio) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxDist = parseFloat(raio);

      banheiros = banheiros
        .map((b) => {
          const dist = calculateDistance(
            userLat,
            userLng,
            b.latitude,
            b.longitude,
          );
          return { ...b, distancia_km: parseFloat(dist.toFixed(2)) };
        })
        .filter((b) => b.distancia_km <= maxDist)
        .sort((a, b) => a.distancia_km - b.distancia_km);
    }

    // 2. Filtro por quantidade mínima de cabines
    if (qtd_minima) {
      banheiros = banheiros.filter((b) => b.quantidade >= parseInt(qtd_minima));
    }

    // 3. Filtro por data
    if (data) {
      banheiros = banheiros.filter(
        (b) => b.data_inicio === data || b.data_final === data,
      );
    }

    res.json(banheiros);
  } catch (error) {
    console.error("Erro nos banheiros:", error);
    res.status(500).json({ error: "Erro ao ler banheiros" });
  }
};
