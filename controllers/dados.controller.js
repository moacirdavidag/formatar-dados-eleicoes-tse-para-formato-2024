import CODIGOS_ELEICOES from "../shared/codigos_eleicoes.js";
import path from "path";
import fs from "fs/promises";
import logger from "../logger.config.js";

export const renderDados = async (req, res) => {
  const publicPath = path.join(process.cwd(), "public");
  const dirs = await fs.readdir(publicPath, { withFileTypes: true });

  const anos = dirs
    .filter((d) => d.isDirectory() && /^ele\d{4}$/.test(d.name))
    .map((d) => d.name.replace("ele", ""))
    .sort((a, b) => Number(b) - Number(a));

  res.render("dados", { anos });
};

export const buscarDados = async (req, res) => {
  try {
    const { ano, turno, estado, municipio, cargo } = req.body;
    logger.debug("Filtros recebidos:", {
      ano,
      turno,
      estado,
      municipio,
      cargo,
    });

    if (!ano || !turno || !estado || !municipio || !cargo) {
      logger.info("Requisição com filtros incompletos");
      return res.status(400).json({ error: "Filtros incompletos" });
    }

    const codEleicao = CODIGOS_ELEICOES[ano]?.turnos[turno];
    if (!codEleicao) {
      logger.info(`Eleição não encontrada para ano ${ano} e turno ${turno}`);
      return res.status(404).json({ error: "Eleição não encontrada" });
    }

    const uf = estado.toLowerCase();
    const fileName = `${uf}${municipio}-c${cargo}-e000${codEleicao}-u.json`;
    const filePath = path.join(
      process.cwd(),
      "public",
      `ele${ano}`,
      codEleicao.toString(),
      "dados",
      uf,
      fileName
    );

    logger.debug(`Arquivo da eleição: ${filePath}`);

    try {
      await fs.access(filePath);
    } catch {
      logger.error(`Arquivo da eleição não encontrado: ${filePath}`);
      return res
        .status(404)
        .json({ error: "Dados da eleição não disponíveis" });
    }

    const fileContent = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(fileContent);

    logger.info(
      `Dados encontrados para ${ano}-${turno}-${estado}-${municipio}-${cargo}`
    );
    return res.json(data);
  } catch (err) {
    logger.error("Erro ao buscar dados:", err);
    return res.status(500).json({ error: "Erro ao buscar dados" });
  }
};
