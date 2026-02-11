const { calculateDistance } = require("../utils/geoUtils");

// --- AQUI ESTÁ A CORREÇÃO ---
// Usando require, a Vercel inclui o arquivo no pacote final automaticamente.
// Não precisamos mais de 'fs' ou 'path'.
const banheirosData = require("../scripts/BanheiroRefinado.json");

exports.getBanheiros = (req, res) => {
  try {
    // Criamos uma cópia para filtrar sem alterar o original
    let banheiros = [...banheirosData];

    // Pegamos os parâmetros da URL
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

    // 3. Filtro por data (visto que alguns são temporários)
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
