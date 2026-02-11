const { calculateDistance } = require("../utils/geoUtils");

// --- AQUI ESTÁ A CORREÇÃO ---
// Importando direto, a Vercel garante que o arquivo vai pro ar.
// Adeus erro 500!
const hospitaisData = require("../scripts/HospitalRefinado.json");

exports.getHospitais = (req, res) => {
  try {
    // Criamos uma cópia para filtrar sem alterar o original
    let hospitais = [...hospitaisData];

    // Pegamos os parâmetros da URL
    const { categoria, bairro, busca, lat, lng, raio } = req.query;

    // 1. Filtro de Proximidade (Geolocalização)
    if (lat && lng && raio) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxDist = parseFloat(raio);

      hospitais = hospitais
        .map((h) => {
          const dist = calculateDistance(
            userLat,
            userLng,
            h.latitude,
            h.longitude,
          );
          return { ...h, distancia_km: parseFloat(dist.toFixed(2)) };
        })
        .filter((h) => h.distancia_km <= maxDist)
        .sort((a, b) => a.distancia_km - b.distancia_km);
    }

    // 2. Filtro por Categoria (HOSPITAL, UPA, etc)
    if (categoria) {
      hospitais = hospitais.filter((h) =>
        h.categoria.toLowerCase().includes(categoria.toLowerCase()),
      );
    }

    // 3. Filtro por Bairro
    if (bairro) {
      hospitais = hospitais.filter((h) =>
        h.bairro.toLowerCase().includes(bairro.toLowerCase()),
      );
    }

    // 4. Busca Global (Nome ou Logradouro)
    if (busca) {
      const termo = busca.toLowerCase();
      hospitais = hospitais.filter(
        (h) =>
          h.nome.toLowerCase().includes(termo) ||
          h.logradouro.toLowerCase().includes(termo),
      );
    }

    res.json(hospitais);
  } catch (error) {
    console.error("Erro nos hospitais:", error);
    res.status(500).json({ error: "Erro ao ler hospitais" });
  }
};
