const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const fs = require("fs");
const readline = require("readline");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// --- SEGURANÇA / AUTENTICAÇÃO ---
const JWT_SECRET =
  process.env.JWT_SECRET || "sua-chave-secreta-super-segura-aqui-2026";
const API_KEYS = {
  "admin-carnaval-bh-2026": { role: "admin", nome: "Admin Portal" },
  "publico-carnaval-2026": { role: "public", nome: "Acesso Público" },
};

const USUARIOS_ADMIN = {
  admin: { senha: "Carnaval@BH2026!", role: "admin" },
  // Adicione mais usuários aqui para testes
};

// Middleware: Verifica autenticação por API Key ou JWT
function autenticar(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const authHeader = req.headers["authorization"];

  // Tenta API Key
  if (apiKey && API_KEYS[apiKey]) {
    req.usuario = { ...API_KEYS[apiKey], via: "api-key" };
    return next();
  }

  // Tenta JWT (Bearer token)
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.usuario = { ...decoded, via: "jwt" };
      return next();
    } catch (err) {
      return res.status(401).json({ erro: "Token inválido ou expirado" });
    }
  }

  // Se nenhuma autenticação, permite como público
  req.usuario = { role: "public", via: "none" };
  next();
}

// Middleware: Verifica se é admin
function verificarAdmin(req, res, next) {
  if (req.usuario.role !== "admin") {
    return res.status(403).json({ erro: "Acesso negado. Admin required." });
  }
  next();
}

app.use(autenticar); // Aplica a todos os requests

// --- LOG ---
app.use((req, res, next) => {
  const hora = new Date().toLocaleTimeString();
  console.log(`[${hora}] 📡 RECEBI: ${req.method} ${req.url}`);
  next();
});

// --- CONFIGURAÇÕES ---
const BASE_URL =
  "https://portalbelohorizonte.com.br/carnaval/2026/programacao/bloco-de-rua";
const TOTAL_PAGINAS = 35;
const ARQUIVO_DB = "banco-de-dados.json";
const TEMPO_EXPIRACAO = 1000 * 60 * 60; // 1 hora
const PATH_BANHEIROS = "./banheiros_fixos.json";

// --- MAPEAMENTO GEOGRÁFICO DE BH (SEU MAPEAMENTO COMPLETO) ---
const COORDENADAS_BAIRROS = {
  CENTRO: { lat: -19.9167, lon: -43.9345 },
  SAVASSI: { lat: -19.9402, lon: -43.9339 },
  LOURDES: { lat: -19.9295, lon: -43.9458 },
  FUNCIONARIOS: { lat: -19.9365, lon: -43.9317 },
  "SANTA TEREZA": { lat: -19.9158, lon: -43.9163 },
  FLORESTA: { lat: -19.9119, lon: -43.9288 },
  PAMPULHA: { lat: -19.8637, lon: -43.966 },
  "SANTA EFIGENIA": { lat: -19.9228, lon: -43.9221 },
  "BARRO PRETO": { lat: -19.9213, lon: -43.9515 },
  ANCHIETA: { lat: -19.9537, lon: -43.9248 },
  SION: { lat: -19.9525, lon: -43.9358 },
  MANGABEIRAS: { lat: -19.9547, lon: -43.9189 },
  PRADO: { lat: -19.9248, lon: -43.9678 },
  SERRA: { lat: -19.9442, lon: -43.9187 },
  "SAO PEDRO": { lat: -19.9456, lon: -43.9389 },
  LAGOINHA: { lat: -19.9077, lon: -43.9472 },
  "CARLOS PRATES": { lat: -19.9135, lon: -43.9605 },
  "SAGRADA FAMILIA": { lat: -19.9085, lon: -43.9165 },
  CONCORDIA: { lat: -19.8972, lon: -43.9335 },
  "CIDADE NOVA": { lat: -19.8953, lon: -43.9231 },
  CAICARA: { lat: -19.9032, lon: -43.9785 },
  PADRE_EUSTAQUIO: { lat: -19.9168, lon: -43.9876 },
  GUTIERREZ: { lat: -19.9372, lon: -43.9645 },
  "SANTO ANTONIO": { lat: -19.9423, lon: -43.9478 },
  BURITIS: { lat: -19.9725, lon: -43.9658 },
  CASTELO: { lat: -19.8825, lon: -44.0042 },
  OURO_PRETO: { lat: -19.8785, lon: -43.9825 },
  JARAGUA: { lat: -19.8652, lon: -43.9525 },
  PLANALTO: { lat: -19.8325, lon: -43.9585 },
  VENDA_NOVA: { lat: -19.8085, lon: -43.9525 },
  BARREIRO: { lat: -19.9752, lon: -44.0258 },
  SALGADO_FILHO: { lat: -19.9325, lon: -43.9925 },
  NOVA_SUISSA: { lat: -19.9358, lon: -43.9821 },
};

const BAIRROS_WARN = new Set();
const ALIAS_BAIRROS = {
  "ALTO CAICARAS": "CAICARA",
  CAICARAS: "CAICARA",
  "CAICARA-ADELAIDE": "CAICARA",
  "NOVO GLORIA": "GLORIA",
  "PEDREIRA PRADO LOPES": "LAGOINHA",
  "CONJUNTO CALIFORNIA I": "CALIFORNIA",
  CALIFORNIA: "CALAFATE",
  "PADRE EUSTAQUIO": "PADRE_EUSTAQUIO",
  "COLEGIO BATISTA": "FLORESTA",
  "BOA VIAGEM": "CENTRO",
  "SANTO AGOSTINHO": "CENTRO",
  UNIVERSITARIO: "CIDADE NOVA",
  "SAO LUIZ": "PAMPULHA",
  BANDEIRANTES: "PAMPULHA",
  "NOVA SUISSA": "NOVA_SUISSA",
};
const CENTRO_BH_DEFAULT = { lat: -19.9167, lon: -43.9345 };

// --- INFRAESTRUTURA REAL ---
const INFRAESTRUTURA_REAL = [
  {
    tipo: "SAUDE",
    nome: "Hospital João XXIII (Trauma)",
    lat: -19.927179,
    lon: -43.932235,
    endereco: "Av. Alfredo Balena, 400",
  },
  {
    tipo: "SAUDE",
    nome: "UPA Centro-Sul",
    lat: -19.922,
    lon: -43.926,
    endereco: "Rua Domingos Vieira, 488",
  },
  {
    tipo: "SAUDE",
    nome: "Hospital Odilon Behrens",
    lat: -19.9048,
    lon: -43.9482,
    endereco: "R. Formiga, 50",
  },
  {
    tipo: "POLICIA",
    nome: "Delegacia Centro (1ª DEPPC)",
    lat: -19.9245,
    lon: -43.935,
    endereco: "Av. Afonso Pena, 984",
  },
  {
    tipo: "POLICIA",
    nome: "Batalhão Rotam",
    lat: -19.9078,
    lon: -43.9628,
    endereco: "Av. Pres. Antônio Carlos",
  },
  {
    tipo: "BANHEIRO",
    nome: "Shopping Cidade",
    lat: -19.9208,
    lon: -43.9388,
    endereco: "Rua Tupis, 337",
  },
  {
    tipo: "BANHEIRO",
    nome: "Pátio Savassi",
    lat: -19.9402,
    lon: -43.9339,
    endereco: "Av. do Contorno, 6061",
  },
  {
    tipo: "BANHEIRO",
    nome: "Mercado Central",
    lat: -19.9234,
    lon: -43.9419,
    endereco: "Av. Augusto de Lima, 744",
  },
  {
    tipo: "METRO",
    nome: "Estação Central",
    lat: -19.9175,
    lon: -43.9332,
    endereco: "Praça da Estação",
  },
  {
    tipo: "METRO",
    nome: "Estação Lagoinha",
    lat: -19.9135,
    lon: -43.946,
    endereco: "Rodoviária",
  },
];

const LISTA_VIP = [
  "ENTAO BRILHA",
  "ENTÃO BRILHA",
  "BAIANAS OZADAS",
  "QUANDO COME SE LAMBUZA",
  "VOLTA BELCHIOR",
  "JUVENTUDE BRONZEADA",
  "HAVAYANAS USADAS",
  "GAROTAS SOLTEIRAS",
  "CHAMA O SÍNDICO",
  "CHAMA O SINDICO",
  "BEIÇO DO WANDO",
  "BEICO DO WANDO",
  "ANGOLA JANGA",
  "TRUCK DO DESEJO",
  "TCHANZINHO ZONA NORTE",
  "PENA DE PAVÃO DE KRISHNA",
  "ALCOVA LIBERTINA",
  "BLOCO DA CALIXTO",
  "AJOMCOMISSO",
  "BARTUCADA",
  "ESTALADEIRA",
  "ME BEIJA QUE EU SOU PAGODEIRO",
  "LAGOINHA",
  "SEPULTURA",
  "FUNK YOU",
  "FILHOS DE TCHA TCHA",
  "ORDINARIOS",
  "MONOBLOCO",
  "BAIANEIRA",
  "CORTE DEVASSA",
  "MAGNOLIA",
  "LIXO DO LUXO",
];

const CLIMA = {
  MANHA: { temp: "24°C", condicao: "Ensolarado 🌤️", chuva: "10%" },
  TARDE: { temp: "29°C", condicao: "Calorão 🔥", chuva: "0%" },
  FIM_TARDE: { temp: "26°C", condicao: "Chuva Isolada ⛈️", chuva: "60%" },
  NOITE: { temp: "23°C", condicao: "Nublado ☁️", chuva: "20%" },
};

let CACHE_BLOCOS = [];
let EM_ATUALIZACAO = false;
let BANHEIROS_EXTRAIDOS = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- UTILITÁRIOS ---
function perguntar(pergunta) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(pergunta, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

function normalizeBanheiro(b) {
  const copy = { ...b };
  if (copy.lng && !copy.lon) copy.lon = copy.lng;
  if (copy.longitude && !copy.lon) copy.lon = copy.longitude;
  if (copy.lat) copy.lat = parseFloat(copy.lat);
  if (copy.lon) copy.lon = parseFloat(copy.lon);
  if (copy.tipo) copy.tipo = String(copy.tipo).toUpperCase();
  else copy.tipo = "BANHEIRO";
  return copy;
}

function getDistanciaEmKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCoordenadas(bairro) {
  if (!bairro) return CENTRO_BH_DEFAULT;
  const b = bairro
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
  for (const [chave, coord] of Object.entries(COORDENADAS_BAIRROS)) {
    if (b.includes(chave) || chave.includes(b)) return coord;
  }
  return CENTRO_BH_DEFAULT;
}

function extrairBairroDoLocal(local) {
  if (!local) return "CENTRO";
  const partes = local
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length < 2) return "CENTRO";
  return partes[partes.length - 1]
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pegarPeriodo(hora) {
  if (!hora) return "tarde";
  const h = parseInt(hora.split(":")[0]);
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

function getPrevisao(horaStr) {
  if (!horaStr) return CLIMA.TARDE;
  const hora = parseInt(horaStr.split(":")[0]);
  if (hora >= 5 && hora < 12) return CLIMA.MANHA;
  if (hora >= 12 && hora < 16) return CLIMA.TARDE;
  if (hora >= 16 && hora < 19) return CLIMA.FIM_TARDE;
  return CLIMA.NOITE;
}

function getCaos(score) {
  if (score >= 100) return "🔴 CAOS TOTAL";
  if (score >= 20) return "🟡 CHEIO";
  return "🟢 SUAVE";
}

function getLinksNavegacao(lat, lon, endereco) {
  const q = encodeURIComponent(`${lat},${lon}`);
  const end = encodeURIComponent(endereco || "Belo Horizonte");
  return {
    google_maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`,
    uber: `https://m.uber.com/ul/?action=setPickup&client_id=YOUR_ID&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lon}&dropoff[formatted_address]=${end}`,
  };
}

// --- CARREGAMENTO INICIAL E GEOCODIFICAÇÃO ---

function carregarBanheirosDoDisco() {
  BANHEIROS_EXTRAIDOS = [];
  try {
    if (fs.existsSync(PATH_BANHEIROS)) {
      const d = JSON.parse(fs.readFileSync(PATH_BANHEIROS, "utf-8"));
      BANHEIROS_EXTRAIDOS = d;
    }
    const alt = "./banheiro-dados.json";
    if (fs.existsSync(alt)) {
      const m = JSON.parse(fs.readFileSync(alt, "utf-8"));
      BANHEIROS_EXTRAIDOS = BANHEIROS_EXTRAIDOS.concat(m || []);
    }
    BANHEIROS_EXTRAIDOS = BANHEIROS_EXTRAIDOS.map(normalizeBanheiro);
    console.log(
      `🚽 Total de banheiros carregados: ${BANHEIROS_EXTRAIDOS.length}`,
    );
  } catch (e) {
    console.log("⚠️ Erro banheiros:", e.message);
  }
}

function getTodasInfras() {
  return [...INFRAESTRUTURA_REAL, ...BANHEIROS_EXTRAIDOS];
}

async function geocodificarNovosBanheiros() {
  let alterado = false;
  console.log("🌍 Verificando GPS dos banheiros...");
  for (let b of BANHEIROS_EXTRAIDOS) {
    if (!b.lat || !b.lon) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(b.endereco)}&limit=1`;
        const res = await axios.get(url, {
          headers: { "User-Agent": "AppCarnavalBH" },
        });
        if (res.data[0]) {
          b.lat = parseFloat(res.data[0].lat);
          b.lon = parseFloat(res.data[0].lon);
          alterado = true;
          console.log(`📍 GPS FIXED: ${b.endereco}`);
        }
        await delay(1200);
      } catch (err) {
        console.log(`❌ Erro GPS: ${b.endereco}`);
      }
    }
  }
  if (alterado) {
    fs.writeFileSync(
      PATH_BANHEIROS,
      JSON.stringify(BANHEIROS_EXTRAIDOS, null, 2),
    );
    console.log("💾 Banheiros atualizados no disco.");
  }
}

// --- SCRAPER PRINCIPAL ---

async function baixarPagina(i) {
  try {
    const { data } = await axios.get(`${BASE_URL}?page=${i}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    const blocosPagina = [];

    $(".listing-block, .views-row").each((index, element) => {
      const dados = $(element).find(".favorito-icon");
      let nome =
        dados.attr("data-titulo") ||
        $(element).find("h3, .title").text().trim();
      let dataStr =
        dados.attr("data-data") || $(element).find(".date").text().trim();
      let horaStr =
        dados.attr("data-hora") ||
        $(element).find(".field--name-field-hora-da-atividade").text().trim();
      let local =
        dados.attr("data-local") || $(element).find(".address").text().trim();

      let bairroOriginal = extrairBairroDoLocal(local);
      let bairro = ALIAS_BAIRROS[bairroOriginal] || bairroOriginal;

      if (!COORDENADAS_BAIRROS[bairro] && !BAIRROS_WARN.has(bairroOriginal)) {
        BAIRROS_WARN.add(bairroOriginal);
        console.log(`⚠️ BAIRRO NÃO MAPEADO: ${bairroOriginal}`);
      }

      if (nome) {
        let nomeLimpo = nome.toUpperCase().replace("BLOCO ", "").trim();
        const nomeSemAcento = nomeLimpo
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        let score = 0;
        const ehFamoso = LISTA_VIP.some((vip) =>
          nomeSemAcento.includes(
            vip.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
          ),
        );
        if (ehFamoso) score += 100;
        if (
          ["SAVASSI", "CENTRO", "SANTA TEREZA"].includes(bairro.toUpperCase())
        )
          score += 10;

        let timestamp = 0;
        if (dataStr && horaStr) {
          const [d, m, a] = dataStr.split("/");
          const [h, mn] = horaStr.split(":");
          timestamp = new Date(`${a}-${m}-${d}T${h}:${mn}:00`).getTime();
        }

        const pontoBase = getCoordenadas(bairro);
        const variacao = (Math.random() - 0.5) * 0.003;
        const lat = pontoBase.lat + variacao;
        const lon = pontoBase.lon + variacao;

        blocosPagina.push({
          id: dados.attr("data-id") || `t_${Math.random()}`,
          nome: nomeLimpo,
          data: dataStr,
          hora: horaStr,
          timestamp: timestamp,
          local: local,
          bairro: bairro.toUpperCase(),
          lat: lat,
          lon: lon,
          score: score,
          destaque: ehFamoso,
          periodo: pegarPeriodo(horaStr),
          previsao: getPrevisao(horaStr),
          nivel_caos: getCaos(score),
          links: getLinksNavegacao(lat, lon, local), // Links inteligentes
        });
      }
    });
    return blocosPagina;
  } catch (error) {
    console.log(`❌ Erro na página ${i}: ${error.message}`);
    return [];
  }
}

async function rodarScraper() {
  if (EM_ATUALIZACAO) return;
  EM_ATUALIZACAO = true;
  console.log("🔄 BAIXANDO DADOS DA PREFEITURA...");
  carregarBanheirosDoDisco(); // Garante banheiros frescos

  let todosBlocos = [];
  const batchSize = 5;
  for (let i = 0; i < TOTAL_PAGINAS; i += batchSize) {
    const promises = [];
    for (let j = 0; j < batchSize && i + j < TOTAL_PAGINAS; j++) {
      console.log(`⬇️ Baixando página ${i + j}...`);
      promises.push(baixarPagina(i + j));
    }
    const resultados = await Promise.all(promises);
    resultados.forEach((lista) => (todosBlocos = todosBlocos.concat(lista)));
    await delay(500);
  }

  // --- O PASSO "PIKA": PRE-CALCULAR INFRA NO JSON ---
  // Isso resolve seu pedido: o JSON salvo já terá os banheiros
  const infraCompleta = getTodasInfras();

  todosBlocos = todosBlocos.map((bloco) => {
    // Filtra e ordena banheiros para este bloco
    const banheirosDesteBloco = infraCompleta
      .filter((i) => i.tipo === "BANHEIRO")
      .map((b) => ({
        ...b, // Mantem dados do banheiro
        distancia: parseFloat(
          getDistanciaEmKm(bloco.lat, bloco.lon, b.lat, b.lon).toFixed(2),
        ),
      }))
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, 3); // Top 3

    // Opcional: Calcular saude/metro mais perto tmb
    const saudeProx = infraCompleta
      .filter((i) => i.tipo === "SAUDE")
      .map((s) => ({
        ...s,
        dist: getDistanciaEmKm(bloco.lat, bloco.lon, s.lat, s.lon),
      }))
      .sort((a, b) => a.dist - b.dist)[0];

    return {
      ...bloco,
      banheiros_proximos: banheirosDesteBloco, // <--- AQUI ESTÁ O QUE VC PEDIU
      infra_emergencia: saudeProx,
    };
  });

  todosBlocos.sort((a, b) => a.timestamp - b.timestamp);
  CACHE_BLOCOS = todosBlocos;
  EM_ATUALIZACAO = false;

  fs.writeFileSync(
    ARQUIVO_DB,
    JSON.stringify({ timestamp: Date.now(), dados: CACHE_BLOCOS }, null, 2),
  );
  console.log(
    `✅ DADOS PRONTOS E SALVOS: ${CACHE_BLOCOS.length} blocos com infraestrutura.`,
  );
}

async function iniciarSistema() {
  console.log("🚀 INICIANDO API (MODO COMPLETO)...");
  carregarBanheirosDoDisco();

  if (fs.existsSync(ARQUIVO_DB)) {
    try {
      const conteudo = fs.readFileSync(ARQUIVO_DB, "utf-8");
      const json = JSON.parse(conteudo);
      if (Date.now() - json.timestamp < TEMPO_EXPIRACAO) {
        console.log(`📂 CACHE VÁLIDO ENCONTRADO.`);
        const resposta = await perguntar("❓ Forçar atualização? (s/N): ");
        if (resposta.toLowerCase() === "s") await rodarScraper();
        else {
          CACHE_BLOCOS = json.dados;
          console.log(`✅ Cache carregado.`);
        }
      } else {
        await rodarScraper();
      }
    } catch (e) {
      console.log("Erro cache, rodando scraper...");
      await rodarScraper();
    }
  } else {
    await rodarScraper();
  }
}

// ================= ROTAS =================

// 1. LISTA PRINCIPAL (Mantendo sua lógica de filtros + User Distance)
app.get("/api/blocos", (req, res) => {
  let resultado = [...CACHE_BLOCOS];
  const q = req.query;

  if (q.dia) resultado = resultado.filter((b) => b.data === q.dia);
  if (q.q) {
    const t = q.q.toUpperCase();
    resultado = resultado.filter(
      (b) => b.nome.includes(t) || b.bairro.includes(t),
    );
  }

  // Se usuário mandou local, calcula distancia Dele -> Bloco
  if (q.lat && q.lon) {
    const userLat = parseFloat(q.lat);
    const userLon = parseFloat(q.lon);

    resultado = resultado.map((b) => ({
      ...b,
      distancia_do_usuario: parseFloat(
        getDistanciaEmKm(userLat, userLon, b.lat, b.lon).toFixed(2),
      ),
    }));

    const radius = parseFloat(q.max_km || q.radius || q.raio || "NaN");
    if (!isNaN(radius)) {
      resultado = resultado.filter((b) => b.distancia_do_usuario <= radius);
    }
    if ((q.proximo === "1" || q.proximo === "true") && isNaN(radius)) {
      resultado = resultado.filter((b) => b.distancia_do_usuario <= 3);
    }
    resultado.sort((a, b) => a.distancia_do_usuario - b.distancia_do_usuario);
  }

  const page = parseInt(q.page) || 1;
  const limit = parseInt(q.limit) || 20;
  res.json({
    total: resultado.length,
    blocos: resultado.slice((page - 1) * limit, page * limit),
  });
});

// 2. CURADORIA (Sua rota original restaurada)
app.get("/api/curadoria", (req, res) => {
  const dia = req.query.dia;
  if (!dia) return res.status(400).json({ erro: "Faltou dia" });

  const blocosDoDia = CACHE_BLOCOS.filter((b) => b.data === dia);
  const pegarTop3 = (periodo) =>
    blocosDoDia
      .filter((b) => b.periodo === periodo)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

  res.json({
    titulo: `Destaques de ${dia}`,
    manha: pegarTop3("manha"),
    tarde: pegarTop3("tarde"),
    noite: pegarTop3("noite"),
  });
});

// 3. LISTAS (Sua rota original restaurada)
app.get("/api/listas", (req, res) => {
  const bairros = [...new Set(CACHE_BLOCOS.map((b) => b.bairro))].sort();
  const datas = [...new Set(CACHE_BLOCOS.map((b) => b.data))].filter((d) => d);
  res.json({ bairros, datas });
});

// 4. SERVICOS (Sua rota original restaurada)
app.get("/api/servicos", (req, res) => {
  const userLat = parseFloat(req.query.lat);
  const userLon = parseFloat(req.query.lon);

  // Pega infra completa fresca
  const infra = getTodasInfras();

  if (!userLat || !userLon) return res.json(infra);

  const servicosProximos = infra.map((local) => {
    const dist = getDistanciaEmKm(userLat, userLon, local.lat, local.lon);
    return {
      ...local,
      distancia: parseFloat(dist.toFixed(2)),
      link_gps: `https://www.google.com/maps/search/?api=1&query=${local.lat},${local.lon}`,
    };
  });

  servicosProximos.sort((a, b) => a.distancia - b.distancia);
  res.json(servicosProximos);
});

// 5. PROXIMO DE MIM (Sua rota original restaurada)
app.get("/api/proximo-de-mim", (req, res) => {
  const { lat, lon, tipo } = req.query;
  if (!lat || !lon)
    return res.status(400).json({ erro: "Preciso de lat e lon" });

  const uLat = parseFloat(lat);
  const uLon = parseFloat(lon);

  let itens = getTodasInfras();
  if (tipo) itens = itens.filter((i) => i.tipo === tipo.toUpperCase());

  const proximos = itens
    .map((item) => {
      const distancia = parseFloat(
        getDistanciaEmKm(uLat, uLon, item.lat, item.lon).toFixed(2),
      );
      const link =
        item.lat && item.lon
          ? `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`
          : null;
      return { ...item, distancia, link_gps: link };
    })
    .sort((a, b) => a.distancia - b.distancia);

  res.json(proximos.slice(0, 10));
});

// 6. ROTA NOVA: AGORA (Para saber o que está rolando)
app.get("/api/agora", (req, res) => {
  const agora = Date.now();
  const toleranciaInicio = 1000 * 60 * 60; // 1h atras
  const toleranciaFim = 1000 * 60 * 60 * 4; // 4h frente

  const rolando = CACHE_BLOCOS.filter((b) => {
    const diff = b.timestamp - agora;
    return diff > -toleranciaInicio && diff < toleranciaFim;
  }).sort((a, b) => a.timestamp - b.timestamp);

  res.json({
    msg: rolando.length > 0 ? "O coro tá comendo!" : "Calmaria...",
    total: rolando.length,
    blocos: rolando,
  });
});

// 7. ROTA NOVA: STATS
app.get("/api/stats", (req, res) => {
  const bairros = {};
  CACHE_BLOCOS.forEach((b) => {
    bairros[b.bairro] = (bairros[b.bairro] || 0) + 1;
  });
  const topBairros = Object.entries(bairros)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  res.json({ total: CACHE_BLOCOS.length, top_bairros: topBairros });
});

// ================= AUTENTICAÇÃO =================

// 8. LOGIN - Gera JWT Token para Admin
app.post("/api/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: "Usuario e senha obrigatórios" });
  }

  const user = USUARIOS_ADMIN[usuario];
  if (!user || user.senha !== senha) {
    return res.status(401).json({ erro: "Usuario ou senha inválidos" });
  }

  // Gera JWT válido por 24 horas
  const token = jwt.sign({ usuario, role: user.role }, JWT_SECRET, {
    expiresIn: "24h",
  });

  res.json({
    mensagem: "Login realizado com sucesso!",
    token,
    tipo: "Bearer",
    expira_em: "24 horas",
    instrucao: "Use header: Authorization: Bearer " + token,
  });
});

// 9. ROTA ADMIN: Ver/Atualizar credenciais (Apenas Admin)
app.get("/api/admin/credenciais", verificarAdmin, (req, res) => {
  res.json({
    api_keys: Object.keys(API_KEYS),
    usuarios_admin: Object.keys(USUARIOS_ADMIN),
    autenticado_como: req.usuario,
  });
});

// 10. ROTA ADMIN: Forçar atualização de scraper
app.post("/api/admin/atualizar-dados", verificarAdmin, async (req, res) => {
  if (EM_ATUALIZACAO) {
    return res.status(409).json({
      erro: "Atualização já em andamento",
      usuario_solicitante: req.usuario,
    });
  }

  res.json({
    mensagem: "Scraper iniciado...",
    usuario_solicitante: req.usuario,
  });

  // Roda em background
  rodarScraper().catch((e) => console.log("Erro scraper:", e));
});

// 11. ROTA ADMIN: Ver logs/status do sistema
app.get("/api/admin/status", verificarAdmin, (req, res) => {
  res.json({
    timestamp: Date.now(),
    blocos_em_cache: CACHE_BLOCOS.length,
    banheiros_carregados: BANHEIROS_EXTRAIDOS.length,
    atualizacao_em_andamento: EM_ATUALIZACAO,
    usuario_solicitante: req.usuario,
    uptime_ms: process.uptime() * 1000,
    memory_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
  });
});

// 12. ROTA PÚBLICA: Info sobre autenticação (test)
app.get("/api/auth-info", (req, res) => {
  res.json({
    seu_acesso: req.usuario,
    como_autenticar: {
      opcao_1_api_key: {
        metodo: "GET/POST com header X-API-Key",
        header: "X-API-Key: admin-carnaval-bh-2026",
        restricao: "Use para automações/scripts",
      },
      opcao_2_jwt: {
        metodo: "POST /api/login com usuario/senha",
        exemplo: {
          usuario: "admin",
          senha: "Carnaval@BH2026!",
        },
        resposta: "Retorna um token JWT válido por 24h",
        uso: "Header: Authorization: Bearer <token>",
      },
      opcao_3_publica: {
        metodo: "Acesso sem autenticação",
        restricao: "Algumas rotas e features limitadas",
      },
    },
    rotas_admin_disponiveis: [
      "POST /api/login - Gera JWT Token",
      "GET /api/admin/credenciais - Ver usuários e keys (ADMIN)",
      "POST /api/admin/atualizar-dados - Força scraper (ADMIN)",
      "GET /api/admin/status - Status do sistema (ADMIN)",
    ],
  });
});

app.listen(3005, () =>
  console.log("🌟 API COMPLETA (LEGACY + PERFORMANCE + SEGURANÇA) NA 3005!"),
);

setInterval(rodarScraper, 1000 * 60 * 60);

async function boot() {
  await iniciarSistema();
  // Roda em background sem travar o boot
  geocodificarNovosBanheiros().catch((e) => console.log("Erro geo bg:", e));
}
boot();

// IGOR

/**
 * Converte UTM -> Lat/Lon (WGS84)
 * Suporta hemisfério sul (south=true) e zona UTM (ex: 23).
 *
 * Referência: fórmulas padrão UTM (WGS84)
 */
function utmToLatLon(easting, northing, zoneNumber, south = true) {
  // WGS84
  const a = 6378137.0; // semi-major
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e = Math.sqrt(1 - (b * b) / (a * a)); // eccentricity
  const e1sq = (e * e) / (1 - e * e);
  const k0 = 0.9996;

  // Remover falso leste/norte
  let x = easting - 500000.0;
  let y = northing;
  if (south) y -= 10000000.0;

  // Meridiano central da zona
  const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3; // em graus

  // Cálculos
  const M = y / k0;
  const mu =
    M /
    (a *
      (1 -
        (e * e) / 4 -
        (3 * Math.pow(e, 4)) / 64 -
        (5 * Math.pow(e, 6)) / 256));

  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));

  const J1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
  const J2 = (21 * Math.pow(e1, 2)) / 16 - (55 * Math.pow(e1, 4)) / 32;
  const J3 = (151 * Math.pow(e1, 3)) / 96;
  const J4 = (1097 * Math.pow(e1, 4)) / 512;

  const fp =
    mu +
    J1 * Math.sin(2 * mu) +
    J2 * Math.sin(4 * mu) +
    J3 * Math.sin(6 * mu) +
    J4 * Math.sin(8 * mu);

  const sinfp = Math.sin(fp);
  const cosfp = Math.cos(fp);
  const tanfp = Math.tan(fp);

  const C1 = e1sq * cosfp * cosfp;
  const T1 = tanfp * tanfp;
  const N1 = a / Math.sqrt(1 - e * e * sinfp * sinfp);
  const R1 = (a * (1 - e * e)) / Math.pow(1 - e * e * sinfp * sinfp, 1.5);
  const D = x / (N1 * k0);

  // Latitude (rad)
  let lat =
    fp -
    ((N1 * tanfp) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e1sq) * Math.pow(D, 4)) /
          24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e1sq - 3 * C1 * C1) *
          Math.pow(D, 6)) /
          720);

  // Longitude (rad)
  let lon =
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e1sq + 24 * T1 * T1) *
        Math.pow(D, 5)) /
        120) /
    cosfp;

  // Converter para graus
  lat = lat * (180 / Math.PI);
  lon = lonOrigin + lon * (180 / Math.PI);

  return { lat, lon };
}

/**
 * Enriquecer FeatureCollection:
 * - lê geometry.coordinates como [Easting, Northing] (UTM)
 * - adiciona properties.lat, properties.lon e properties.googleMaps
 */
function enrichGeoJSONWithLatLon(geojson, zoneNumber = 23, south = true) {
  const out = JSON.parse(JSON.stringify(geojson)); // clone simples

  for (const feat of out.features || []) {
    if (!feat?.geometry || feat.geometry.type !== "Point") continue;

    const coords = feat.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const [easting, northing] = coords;
    const { lat, lon } = utmToLatLon(
      Number(easting),
      Number(northing),
      zoneNumber,
      south,
    );

    feat.properties = feat.properties || {};
    feat.properties.lat = lat;
    feat.properties.lon = lon;
    feat.properties.googleMaps = `https://www.google.com/maps?q=${lat},${lon}`;
  }

  return out;
}

/* ===========================
   EXEMPLO DE USO
   =========================== */

// Cole aqui o seu FeatureCollection:
const input = {
  type: "FeatureCollection",
  totalFeatures: "unknown",
  features: [
    {
      type: "Feature",
      id: "banheiros_fixos.12488.321",
      geometry: { type: "Point", coordinates: [613339.1, 7797403.2] },
      properties: { OBSERVACOES: "..." },
    },
    {
      type: "Feature",
      id: "banheiros_fixos.12539.321",
      geometry: { type: "Point", coordinates: [611005.64, 7795842.63] },
      properties: { OBSERVACOES: "..." },
    },
  ],
};

// Converte assumindo UTM 23S (PBH)
const output = enrichGeoJSONWithLatLon(input, 23, true);

// Imprime resultado já com link do Google Maps
console.log(JSON.stringify(output, null, 2));

// Se quiser só listar links:
for (const f of output.features) {
  console.log(
    f.id,
    f.properties.lat,
    f.properties.lon,
    f.properties.googleMaps,
  );
}
