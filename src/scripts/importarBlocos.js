const fs = require("fs");
const path = require("path");
const proj4 = require("proj4");

// Definições de projeção (UTM 23S -> WGS84)
const utm = "+proj=utm +zone=23 +south +datum=SIRGAS2000 +units=m +no_defs";
const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";

// Função para converter coordenadas
const converterParaLatLng = (x, y) => {
  if (!x || !y) return { lat: 0, lng: 0 };
  const [lng, lat] = proj4(utm, wgs84, [x, y]);
  return { lat, lng };
};

// Função para escapar texto e evitar erro de SQL (aspas simples)
// Se for null ou undefined, retorna 'NULL' sem aspas
const escaparTexto = (texto) => {
  if (texto === null || texto === undefined) return "NULL";
  // Converte para string e dobra as aspas simples (ex: D'Or -> D''Or)
  return `'${String(texto).replace(/'/g, "''")}'`;
};

const gerarArquivoSQL = () => {
  // Nome do arquivo de entrada
  const filePath = path.join(__dirname, "banco-dados-hospitais.json");

  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo ${filePath} não encontrado.`);
    return;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  const features = json.features || [];

  console.log(`Processando ${features.length} hospitais...`);

  let sqlContent = `TRUNCATE TABLE hospitais;\n\n`;
  sqlContent += `INSERT INTO hospitais (
    nome, 
    categoria, 
    sigla_categoria, 
    tipo_logradouro, 
    logradouro, 
    numero, 
    bairro, 
    latitude, 
    longitude
  ) VALUES\n`;

  const valuesList = [];

  features.forEach((item) => {
    if (!item.geometry || !item.geometry.coordinates) return;

    const props = item.properties || {};

    // 1. Extração e Tratamento de Campos de Texto
    const nome = escaparTexto(props.NOME);
    const categoria = escaparTexto(props.CATEGORIA);
    const siglaCategoria = escaparTexto(props.SIGLA_CATEGORIA);
    const tipoLogradouro = escaparTexto(props.TIPO_LOGRADOURO);
    const logradouro = escaparTexto(props.LOGRADOURO);
    const numero = escaparTexto(props.NUMERO_IMOVEL);
    const bairro = escaparTexto(props.NOME_BAIRRO_POPULAR);

    // 2. Conversão de Coordenadas (UTM -> Lat/Lng)
    const [x, y] = item.geometry.coordinates;
    const { lat, lng } = converterParaLatLng(x, y);

    // 3. Montagem da Linha SQL
    const linha = `(
      ${nome},
      ${categoria},
      ${siglaCategoria},
      ${tipoLogradouro},
      ${logradouro},
      ${numero},
      ${bairro},
      ${lat},
      ${lng}
    )`;

    valuesList.push(linha);
  });

  if (valuesList.length > 0) {
    sqlContent += valuesList.join(",\n") + ";";
    fs.writeFileSync("resultado_hospitais.sql", sqlContent);
    console.log(`Arquivo resultado_hospitais.sql gerado com sucesso!`);
  } else {
    console.log("Nenhum dado processado.");
  }
};

gerarArquivoSQL();
