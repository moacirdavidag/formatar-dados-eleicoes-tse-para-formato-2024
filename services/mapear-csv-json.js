import fs from "fs";
import csvParser from "csv-parser";
import { Worker } from "worker_threads";
import iconv from "iconv-lite";
import logger from "../logger.config.js";

const lerCSV = (arquivo) =>
  new Promise((resolve, reject) => {
    const dados = [];
    fs.createReadStream(arquivo)
      .pipe(iconv.decodeStream("win1252"))
      .pipe(csvParser({ separator: ";", quote: '"' }))
      .on("data", (row) => dados.push(row))
      .on("end", () => resolve(dados))
      .on("error", reject);
  });

const mapearCSVJSON = async (caminhos, anoEleicao) => {
  try {
    logger.info(`[Mapeamento CSV-JSON] Iniciando processamento ${anoEleicao}`);

    const { caminhoDetalhe, caminhoCandidatos } = caminhos;

    const detalhe = await lerCSV(caminhoDetalhe);
    const candidatos = await lerCSV(caminhoCandidatos);

    const detalheIndex = new Map();

    for (const d of detalhe) {
      const chave = [
        d.ANO_ELEICAO,
        d.CD_MUNICIPIO,
        d.NR_ZONA,
        d.CD_CARGO,
        d.NR_TURNO,
      ].join("_");

      detalheIndex.set(chave, d);
    }

    const cidades = new Map();

    for (const cand of candidatos) {
      const chave = [
        cand.ANO_ELEICAO,
        cand.CD_MUNICIPIO,
        cand.NR_ZONA,
        cand.CD_CARGO,
        cand.NR_TURNO,
      ].join("_");

      const det = detalheIndex.get(chave);

      if (!det) {
        logger.error(`[Mapeamento CSV-JSON] Detalhe não encontrado`, cand);
        continue;
      }

      const idCidade = [cand.CD_ELEICAO, cand.CD_MUNICIPIO, cand.CD_CARGO].join(
        "_"
      );

      if (!cidades.has(idCidade)) {
        cidades.set(idCidade, {
          detalhe: det,
          candidatos: [],
        });
      }

      cidades.get(idCidade).candidatos.push(cand);
    }

    logger.info(
      `[Mapeamento CSV-JSON] Total de arquivos para processar: ${cidades.size}`
    );

    const promises = [];

    for (const [idCidade, cidade] of cidades) {
      promises.push(
        new Promise((resolve, reject) => {
          const worker = new Worker(
            new URL("../workers/workerAdapter2024.js", import.meta.url),
            {
              workerData: cidade,
              type: "module",
            }
          );

          worker.on("message", (msg) => {
            if (msg?.ok) {
              logger.info(
                `[Mapeamento CSV-JSON] Cidade processada com sucesso`,
                { idCidade }
              );
              resolve();
            } else {
              logger.error(`[Mapeamento CSV-JSON] Erro cidade`, {
                idCidade,
                erro: msg?.erro,
              });
              reject(msg?.erro);
            }
          });

          worker.on("error", (erro) => {
            logger.error(`[Mapeamento CSV-JSON] Worker error`, {
              idCidade,
              erro,
            });
            reject(erro);
          });

          worker.on("exit", (code) => {
            if (code !== 0) {
              logger.error(
                `[Mapeamento CSV-JSON] Worker finalizou com código ${code}`,
                { idCidade }
              );
              reject(new Error(`Worker exit ${code}`));
            }
          });
        })
      );
    }

    await Promise.all(promises);

    logger.info(`[Mapeamento CSV-JSON] Finalizado com sucesso`);
  } catch (erro) {
    logger.error(`[Mapeamento CSV-JSON] Erro geral`, erro);
    throw erro;
  }
};

export default mapearCSVJSON;
