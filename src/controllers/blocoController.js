const fs = require("fs");
const path = require("path");
const { calculateDistance } = require("../utils/geoUtils");

const readJson = (fileName) => {
  try {
    const filePath = path.join(__dirname, "..", "scripts", fileName);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return [];
  }
};

const buscarProximos = (arquivo, lat, lng, limite = 3) => {
  const dados = readJson(arquivo);
  if (!dados.length) return [];

  return dados
    .map((item) => {
      const itemLat = item.latitude || item.inicio_lat;
      const itemLng = item.longitude || item.inicio_lng;
      const dist = calculateDistance(lat, lng, itemLat, itemLng);
      return { ...item, distancia_km: parseFloat(dist.toFixed(2)) };
    })
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, limite);
};

exports.getBlocos = (req, res) => {
  try {
    let blocos = readJson("BlocoRefinado.json");
    const { bairro, busca, data, lat, lng, raio } = req.query;

    if (lat && lng) {
      const uLat = parseFloat(lat);
      const uLng = parseFloat(lng);
      blocos = blocos.map((b) => {
        const d = calculateDistance(uLat, uLng, b.inicio_lat, b.inicio_lng);
        return { ...b, distancia_usuario_km: parseFloat(d.toFixed(2)) };
      });
      if (raio)
        blocos = blocos.filter(
          (b) => b.distancia_usuario_km <= parseFloat(raio),
        );
      blocos.sort((a, b) => a.distancia_usuario_km - b.distancia_usuario_km);
    }

    // Filtros de busca (idênticos ao anterior)
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

    const resultado = blocos.map((bloco) => {
      const banheiros = buscarProximos(
        "BanheiroRefinado.json",
        bloco.inicio_lat,
        bloco.inicio_lng,
        3,
      );
      const hospitais = buscarProximos(
        "HospitalRefinado.json",
        bloco.inicio_lat,
        bloco.inicio_lng,
        3,
      );

      return {
        ...bloco,
        servicos_proximos: {
          banheiros: banheiros.map((ban) => ({
            // CORREÇÃO AQUI: Se não tem logradouro, manda a info de auxílio
            endereco: ban.logradouro
              ? `${ban.tipo_logradouro || ""} ${ban.logradouro}, ${ban.numero || "S/N"}`.trim()
              : `Ponto de Banheiro próximo ao Bloco`,
            quantidade_cabines: ban.quantidade,
            distancia_km: ban.distancia_km,
            link_localizacao: `https://www.google.com/maps/search/?api=1&query=${ban.latitude},${ban.longitude}`,
          })),
          hospitais: hospitais.map((hosp) => ({
            nome: hosp.nome,
            endereco:
              `${hosp.tipo_logradouro || ""} ${hosp.logradouro}, ${hosp.numero || "S/N"}`.trim(),
            distancia_km: hosp.distancia_km,
          })),
        },
        links_transporte: {
          google_maps: `https://www.google.com/maps/dir/?api=1&destination=${bloco.inicio_lat},${bloco.inicio_lng}&travelmode=transit`,
          waze: `https://waze.com/ul?ll=${bloco.inicio_lat},${bloco.inicio_lng}&navigate=yes`,
          uber: `uber://?action=setPickup&dropoff[latitude]=${bloco.inicio_lat}&dropoff[longitude]=${bloco.inicio_lng}`,
          pop: `99taxi://?lat=${bloco.inicio_lat}&lng=${bloco.inicio_lng}&action=navigate`,
        },
      };
    });

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: "Erro interno" });
  }
};
