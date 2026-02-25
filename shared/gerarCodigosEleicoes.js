import fs from "fs/promises";
import path from "path";
import logger from "../logger.config.js";

const MAPEAMENTO_CARGOS_ELEICOES = {
  "0001": "Presidente",
  "0003": "Governador",
  "0005": "Senador",
  "0006": "Deputado Federal",
  "0007": "Deputado Estadual",
  "0008": "Deputado Distrital",
  "0011": "Prefeito",
  "0013": "Vereador",
};

const normalizarCargo = (codigo) => {
  const padded = String(codigo).padStart(4, "0");
  const nome = MAPEAMENTO_CARGOS_ELEICOES[padded];
  if (!nome) return null;
  return {
    codigo: String(parseInt(padded, 10)),
    nome,
  };
};

export const gerarCodigosEleicoes = async () => {
  try {
    logger.info("Iniciando geração do codigos_eleicoes.json");

    const base = path.join(process.cwd(), "public");
    const anosDirs = await fs.readdir(base, { withFileTypes: true });

    const result = {};

    for (const dir of anosDirs) {
      if (!dir.isDirectory() || !dir.name.startsWith("ele")) continue;

      const ano = dir.name.replace("ele", "");
      const anoPath = path.join(base, dir.name);

      logger.info(`Processando ano ${ano}`);

      const codigos = await fs.readdir(anoPath, { withFileTypes: true });

      const turnosTemp = new Set();
      const cargosTemp = {};

      for (const cod of codigos) {
        if (!cod.isDirectory()) continue;

        const codEleicao = cod.name;
        const dadosPath = path.join(anoPath, codEleicao, "dados");

        try {
          const ufs = await fs.readdir(dadosPath);

          for (const uf of ufs) {
            const ufPath = path.join(dadosPath, uf);
            const files = await fs.readdir(ufPath);

            files.forEach((file) => {
              const cargoMatch = file.match(/-c(\d+)-/);
              if (!cargoMatch) return;

              const cargoRaw = cargoMatch[1];
              const cargoNorm = normalizarCargo(cargoRaw);

              if (!cargoNorm) return;

              turnosTemp.add(parseInt(codEleicao, 10));
              cargosTemp[cargoNorm.codigo] = cargoNorm.nome;
            });
          }
        } catch (err) {
          logger.warn(`Erro ao processar ${dadosPath}: ${err?.message || err}`);
        }
      }

      const turnosOrdenados = Array.from(turnosTemp).sort((a, b) => a - b);

      const turnos = {};
      turnosOrdenados.forEach((codigo, index) => {
        turnos[index + 1] = codigo;
      });

      result[ano] = {
        turnos,
        cargos: cargosTemp,
      };

      logger.info(`Ano ${ano} processado`);
    }

    const output = path.join(
      process.cwd(),
      "public",
      "js",
      "codigos_eleicoes.json"
    );

    await fs.writeFile(output, JSON.stringify(result, null, 2));

    logger.info("codigos_eleicoes.json gerado com sucesso");

    return result;
  } catch (err) {
    logger.error("Erro ao gerar codigos_eleicoes:", err);
    throw err;
  }
};
