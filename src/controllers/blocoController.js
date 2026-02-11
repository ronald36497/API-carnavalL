const { calculateDistance } = require("../utils/geoUtils");

// --- AQUI ESTÁ A MÁGICA ---
// Usando require, a Vercel garante que esses arquivos vão pro ar!
const blocosData = require("../scripts/BlocoRefinado.json");
const banheirosData = require("../scripts/BanheiroRefinado.json");
const hospitaisData = require("../scripts/HospitalRefinado.json");

// --- FUNÇÕES AUXILIARES ---

const buscarItensProximos = (dados, lat, lng, raioMax = 1.0, limite = 3) => {
  try {
    return dados
      .map((item) => {
        // Garante que pega a latitude certa (alguns arquivos tem nomes diferentes)
        const itemLat = item.latitude || item.inicio_lat;
        const itemLng = item.longitude || item.inicio_lng;

        const dist = calculateDistance(lat, lng, itemLat, itemLng);
        return { ...item, distancia_km: parseFloat(dist.toFixed(2)) };
      })
      .filter((item) => item.distancia_km <= raioMax)
      .sort((a, b) => a.distancia_km - b.distancia_km)
      .slice(0, limite);
  } catch (e) {
    return [];
  }
};

const gerarLinksTransporte = (lat, lng, nomeDestino) => {
  const destinoEncoded = encodeURIComponent(nomeDestino);
  return {
    google_maps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    uber: `uber://?action=setPickup&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${destinoEncoded}`,
    "99pop": `99taxi://?lat=${lat}&lng=${lng}&action=navigate`,
  };
};

// --- CONTROLLERS ---

exports.getBlocos = (req, res) => {
  try {
    // Clona os dados para não alterar o original
    let blocos = [...blocosData];
    const { bairro, busca, data, lat, lng, raio } = req.query;

    // 1. Filtro de Geolocalização
    if (lat && lng) {
      const uLat = parseFloat(lat);
      const uLng = parseFloat(lng);

      blocos = blocos.map((b) => {
        const d = calculateDistance(uLat, uLng, b.inicio_lat, b.inicio_lng);
        return { ...b, distancia_usuario_km: parseFloat(d.toFixed(2)) };
      });

      if (raio) {
        blocos = blocos.filter(
          (b) => b.distancia_usuario_km <= parseFloat(raio),
        );
      }
      // Ordena do mais perto para o mais longe
      blocos.sort((a, b) => a.distancia_usuario_km - b.distancia_usuario_km);
    }

    // 2. Filtros de Texto
    if (bairro)
      blocos = blocos.filter((b) =>
        b.bairro.toLowerCase().includes(bairro.toLowerCase()),
      );
    if (data) blocos = blocos.filter((b) => b.data === data);
    if (busca) {
      const t = busca.toLowerCase();
      blocos = blocos.filter(
        (b) =>
          b.nome.toLowerCase().includes(t) ||
          b.logradouro.toLowerCase().includes(t),
      );
    }

    // 3. Enriquecimento (Banheiros e Hospitais)
    const resultado = blocos.map((bloco) => {
      // Passamos os dados já carregados para a função auxiliar
      const banheiros = buscarItensProximos(
        banheirosData,
        bloco.inicio_lat,
        bloco.inicio_lng,
        1.0,
        3,
      );
      const hospitais = buscarItensProximos(
        hospitaisData,
        bloco.inicio_lat,
        bloco.inicio_lng,
        3.0,
        3,
      );

      return {
        ...bloco,
        servicos_proximos: {
          qtd_banheiros: banheiros.length, // Resumo para o card
          qtd_hospitais: hospitais.length,
          banheiros, // Detalhe completo
          hospitais,
        },
        links_transporte: gerarLinksTransporte(
          bloco.inicio_lat,
          bloco.inicio_lng,
          bloco.nome,
        ),
      };
    });

    res.json(resultado);
  } catch (error) {
    console.error("Erro crítico:", error);
    res.status(500).json({ error: "Erro interno ao processar blocos" });
  }
};

// Rota de Detalhes (por ID)
exports.getBlocoById = (req, res) => {
  const { id } = req.params;
  const bloco = blocosData.find((b) => b.id === id);
  if (!bloco) return res.status(404).json({ error: "Bloco não encontrado" });

  // Reutiliza a lógica de enriquecimento se necessário, ou retorna direto
  // (Idealmente, você chama a mesma lógica de cima para entregar banheiros no detalhe também)
  res.json(bloco);
};
