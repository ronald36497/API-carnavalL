const { calculateDistance } = require("../utils/geoUtils");

const blocosData = require("../scripts/BlocoRefinado.json");
const banheirosData = require("../scripts/BanheiroRefinado.json");
const hospitaisData = require("../scripts/HospitalRefinado.json");

const DURACAO_MINUTOS = 120;

const calcularStatusEPosicao = (bloco) => {
  const agora = new Date();

  const [hora, minuto] = bloco.hora_inicio.split(":").map(Number);

  const inicio = new Date(bloco.data);
  inicio.setHours(hora);
  inicio.setMinutes(minuto);
  inicio.setSeconds(0);

  const fim = new Date(inicio.getTime() + DURACAO_MINUTOS * 60000);

  if (agora < inicio) {
    return {
      status: "nao_iniciado",
      latitude: bloco.inicio_lat,
      longitude: bloco.inicio_lng,
      hora_fim: fim,
      minutos_restantes: null,
    };
  }

  if (agora > fim) {
    return {
      status: "finalizado",
      latitude: bloco.fim_lat,
      longitude: bloco.fim_lng,
      hora_fim: fim,
      minutos_restantes: 0,
    };
  }

  const tempoPassado = (agora - inicio) / 60000;
  const progresso = tempoPassado / DURACAO_MINUTOS;

  const latAtual =
    bloco.inicio_lat + (bloco.fim_lat - bloco.inicio_lat) * progresso;

  const lngAtual =
    bloco.inicio_lng + (bloco.fim_lng - bloco.inicio_lng) * progresso;

  return {
    status: "em_andamento",
    latitude: latAtual,
    longitude: lngAtual,
    hora_fim: fim,
    minutos_restantes: Math.floor(DURACAO_MINUTOS - tempoPassado),
  };
};

const buscarItensProximos = (dados, lat, lng, raioMax = 1.0, limite = 3) => {
  return dados
    .map((item) => {
      const itemLat = item.latitude || item.inicio_lat;
      const itemLng = item.longitude || item.inicio_lng;
      const dist = calculateDistance(lat, lng, itemLat, itemLng);
      return { ...item, distancia_km: parseFloat(dist.toFixed(2)) };
    })
    .filter((item) => item.distancia_km <= raioMax)
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, limite);
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

exports.getBlocos = (req, res) => {
  try {
    let blocos = [...blocosData];
    const { bairro, busca, data, lat, lng, raio } = req.query;

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
      const dinamico = calcularStatusEPosicao(bloco);

      const banheiros = buscarItensProximos(
        banheirosData,
        dinamico.latitude,
        dinamico.longitude,
        1.0,
        3,
      );

      const hospitais = buscarItensProximos(
        hospitaisData,
        dinamico.latitude,
        dinamico.longitude,
        3.0,
        3,
      );

      return {
        ...bloco,
        status: dinamico.status,
        posicao_atual: {
          latitude: dinamico.latitude,
          longitude: dinamico.longitude,
        },
        hora_fim: dinamico.hora_fim,
        minutos_restantes: dinamico.minutos_restantes,
        servicos_proximos: {
          qtd_banheiros: banheiros.length,
          qtd_hospitais: hospitais.length,
          banheiros,
          hospitais,
        },
        links_transporte: gerarLinksTransporte(
          dinamico.latitude,
          dinamico.longitude,
          bloco.nome,
        ),
      };
    });

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: "Erro interno ao processar blocos" });
  }
};
