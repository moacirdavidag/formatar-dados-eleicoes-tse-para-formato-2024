import path from "path";
import fs from "fs/promises";
import logger from "../logger.config.js";

const BASE_DIR = path.join(process.cwd(), "assets");

export const renderArquivos = async (req, res) => {
  try {
    logger.info("Renderizando página de arquivos");
    res.render("arquivos");
  } catch (error) {
    logger.error("Erro ao renderizar arquivos", error);
    res.status(500).json({ error: "Erro interno" });
  }
};

export const listarArquivos = async (req, res) => {
  const pasta = path.join(BASE_DIR, "arquivos_tse");

  try {
    logger.info("Listando arquivos", { pasta });

    const files = await fs.readdir(pasta);
    const lista = [];

    for (const file of files) {
      const filePath = path.join(pasta, file);
      const stat = await fs.stat(filePath);

      if (stat.isFile()) {
        lista.push({
          nome: file,
          tamanho: stat.size,
          criadoEm: stat.birthtime,
        });
      }
    }

    res.json(lista);
  } catch (error) {
    logger.error("Erro ao listar arquivos", error);
    res.status(500).json({ error: "Erro ao listar arquivos" });
  }
};

export const excluirArquivo = async (req, res) => {
  const { nome } = req.params;
  const filePath = path.join(BASE_DIR, "arquivos_tse", nome);

  try {
    logger.info("Excluindo arquivo", { nome, filePath });

    await fs.unlink(filePath);

    res.json({ success: true });
  } catch (error) {
    logger.error("Erro ao excluir arquivo", error);
    res.status(500).json({ error: "Erro ao excluir arquivo" });
  }
};
