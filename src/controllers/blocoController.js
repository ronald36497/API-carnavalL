const { calculateDistance } = require("../utils/geoUtils");

const blocosData = require("../scripts/BlocoRefinado.json");
const banheirosData = require("../scripts/BanheiroRefinado.json");
const hospitaisData = require("../scripts/HospitalRefinado.json");

const DURACAO_MINUTOS = 120; // 2 Horas de duração

// Função auxiliar para pegar hora Brasil
const getHoraBrasil = () => {
  const data = new Date().toLocaleString("en-US", {
    timeZone: "America/Sao_Paulo",
  });
  return new Date(data);
};

const calcularStatusEPosicao = (bloco) => {
  const agora = getHoraBrasil(); // Usa hora Brasil corrigida

  // Cria a data do bloco baseada na string 'YYYY-MM-DD'
  // Adiciona 'T00:00:00' para garantir que o parse seja local/correto
  const [ano, mes, dia] = bloco.data.split("-");

  const [hora, minuto] = bloco.hora_inicio.split(":").map(Number);

  const inicio = new Date(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    hora,
    minuto,
    0,
  );
  const fim = new Date(inicio.getTime() + DURACAO_MINUTOS * 60000);

  // 1. Ainda não começou
  if (agora < inicio) {
    return {
      status: "nao_iniciado", // Frontend: "Agendado"
      latitude: bloco.inicio_lat,
      longitude: bloco.inicio_lng,
      hora_fim: fim,
      minutos_restantes: null,
    };
  }

  // 2. Já acabou
  if (agora > fim) {
    return {
      status: "finalizado", // Frontend: "Ocorreu" (Cinza)
      latitude: bloco.fim_lat,
      longitude: bloco.fim_lng,
      hora_fim: fim,
      minutos_restantes: 0,
    };
  }

  // 3. Está rolando
  const tempoPassado = (agora - inicio) / 60000;
  const progresso = tempoPassado / DURACAO_MINUTOS;

  const latAtual =
    bloco.inicio_lat + (bloco.fim_lat - bloco.inicio_lat) * progresso;
  const lngAtual =
    bloco.inicio_lng + (bloco.fim_lng - bloco.inicio_lng) * progresso;

  return {
    status: "em_andamento", // Frontend: "Acontecendo" (Pulsando)
    latitude: latAtual,
    longitude: lngAtual,
    hora_fim: fim,
    minutos_restantes: Math.floor(DURACAO_MINUTOS - tempoPassado),
  };
};

const buscarItensProximos = (dados, lat, lng, raioMax, limite = 3) => {
  return dados
    .map((item) => {
      // Garante que lat/lng sejam números
      const itemLat = Number(item.latitude || item.inicio_lat);
      const itemLng = Number(item.longitude || item.inicio_lng);

      const dist = calculateDistance(
        Number(lat),
        Number(lng),
        itemLat,
        itemLng,
      );
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
    const { bairro, busca, data } = req.query;

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

      // AUMENTADO O RAIO DE BUSCA
      // Banheiros: raio de 2.0km (antes era 1.0)
      const banheiros = buscarItensProximos(
        banheirosData,
        dinamico.latitude,
        dinamico.longitude,
        2.0,
        3,
      );

      // Hospitais: raio de 5.0km (antes era 3.0)
      const hospitais = buscarItensProximos(
        hospitaisData,
        dinamico.latitude,
        dinamico.longitude,
        5.0,
        3,
      );

      return {
        ...bloco,
        status: dinamico.status, // "nao_iniciado" | "em_andamento" | "finalizado"
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
    console.error(error);
    res.status(500).json({ error: "Erro interno ao processar blocos" });
  }
};
