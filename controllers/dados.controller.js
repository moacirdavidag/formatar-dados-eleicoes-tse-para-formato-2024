import path from "path";
import fs from "fs/promises";
import logger from "../logger.config.js";

const capitalize = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getCodigoEleicao = (CODIGOS_ELEICOES, ano, turno, cargo) => {
  const cargoStr = String(cargo);

  if (cargoStr === "1") {
    return CODIGOS_ELEICOES?.[ano]?.federal?.[turno] || null;
  }

  if (cargoStr === "3" || cargoStr === "5" || cargoStr === "6" || cargoStr === "7") {
    return CODIGOS_ELEICOES?.[ano]?.estadual?.[turno] || null;
  }

  if (cargoStr === "11" || cargoStr === "13") {
    return CODIGOS_ELEICOES?.[ano]?.municipal?.[turno] || null;
  }

  return null;
};

const getNomeMunicipio = async (uf, codTSE) => {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      `cidades_${uf.toUpperCase()}.json`
    );
    const content = await fs.readFile(filePath, "utf-8");
    const cidades = JSON.parse(content);
    const cidade = cidades.find((c) => c.codTSE === codTSE);
    return cidade ? capitalize(cidade.nome) : "Município Desconhecido";
  } catch {
    return "Município Desconhecido";
  }
};

const getAnosDisponiveis = async () => {
  const publicPath = path.join(process.cwd(), "public");
  const dirs = await fs.readdir(publicPath, { withFileTypes: true });
  return dirs
    .filter((d) => d.isDirectory() && /^ele\d{4}$/.test(d.name))
    .map((d) => d.name.replace("ele", ""))
    .sort((a, b) => Number(b) - Number(a));
};

const getCodigosEleicoes = async () => {
  const filePath = path.join(
    process.cwd(),
    "public",
    "js",
    "codigos_eleicoes.json"
  );
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
};

export const buscarDados = async (req, res) => {
  try {
    const { ano, turno, estado, municipio, cargo } =
      req.body && Object.keys(req.body).length > 0 ? req.body : req.query;

    if (!ano || !turno || !estado || !municipio || !cargo) {
      const anos = await getAnosDisponiveis();
      return res.render("dados", { anos });
    }

    const [CODIGOS_ELEICOES, anos, nomeMunicipio] = await Promise.all([
      getCodigosEleicoes(),
      getAnosDisponiveis(),
      getNomeMunicipio(estado, municipio),
    ]);

    const codEleicao = getCodigoEleicao(CODIGOS_ELEICOES, ano, turno, cargo);
    if (!codEleicao) {
      const anos = await getAnosDisponiveis();
      return res
        .status(404)
        .render("dados", { error: "Eleição não encontrada", anos });
    }

    const uf = estado.toLowerCase();
    const fileName = `${uf}${municipio}-c${String(cargo).padStart(
      4,
      "0"
    )}-e${String(codEleicao).padStart(6, "0")}-u.json`;
    const filePath = path.join(
      process.cwd(),
      "public",
      `ele${ano}`,
      codEleicao.toString(),
      "dados",
      uf,
      fileName
    );

    await fs.access(filePath);
    const fileContent = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(fileContent);

    const nomeCargo = data.carg && data.carg[0] ? data.carg[0].nmn : "Cargo";
    const baseUrl = process.env.URL_SITE_BASE || "http://localhost:3000";

    const seo = {
      title: `Eleições ${ano} - Resultados do ${turno}º Turno para ${nomeCargo} em ${nomeMunicipio} - ${estado.toUpperCase()}`,
      description: `Resultados oficiais das Eleições ${ano}: ${nomeCargo} em ${nomeMunicipio}/${estado.toUpperCase()}.`,
      url: `${baseUrl}/dados?ano=${ano}&turno=${turno}&estado=${estado}&municipio=${municipio}&cargo=${cargo}`,
      image: `${baseUrl}/api/og-image?ano=${ano}&turno=${turno}&cargo=${encodeURIComponent(
        nomeCargo
      )}&cidade=${encodeURIComponent(
        nomeMunicipio
      )}&uf=${estado.toUpperCase()}`,
    };

    const schema = {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: seo.title,
      description: seo.description,
      url: seo.url,
      spatialCoverage: {
        "@type": "Place",
        name: `${nomeMunicipio}, ${estado.toUpperCase()}`,
      },
      temporalCoverage: `${ano}`,
      publisher: {
        "@type": "Organization",
        name: "Dados Históricos - Eleições Brasil",
      },
    };

    const wantsJson =
      req.xhr ||
      req.headers.accept?.includes("application/json") ||
      req.headers["content-type"]?.includes("application/json");

    if (wantsJson) {
      return res.json({ data, seo, schema, anos });
    }

    return res.render("dados", {
      data,
      jsonData: JSON.stringify(data),
      seo,
      schema: JSON.stringify(schema),
      anos,
      filters: {
        ano,
        turno,
        estado,
        municipio,
        municipioNome: nomeMunicipio,
        cargo,
        cargoNome: nomeCargo,
      },
    });
  } catch (err) {
    logger.error("Erro ao buscar dados:", err);
    const anos = await getAnosDisponiveis();
    return res
      .status(500)
      .render("dados", { error: "Erro ao carregar dados", anos });
  }
};
