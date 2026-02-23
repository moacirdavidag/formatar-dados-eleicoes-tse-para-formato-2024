import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { Worker } from "worker_threads";
import iconv from "iconv-lite";
import logger from "../logger.config.js";

const appendEstado = (estadoSigla, nomeEstado) => {
  const dir = path.join(process.cwd(), "public");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, "estados.json");

  let estados = [];
  if (fs.existsSync(file)) {
    estados = JSON.parse(fs.readFileSync(file, "utf-8"));
  }

  if (!estados.find((e) => e.sigla === estadoSigla)) {
    estados.push({ sigla: estadoSigla, nome: nomeEstado });
    fs.writeFileSync(file, JSON.stringify(estados, null, 2));
  }
};

const appendCidade = (uf, cidadeObj) => {
  const file = path.join("public", `cidades_${uf}.json`);

  let cidades = [];
  if (fs.existsSync(file)) {
    cidades = JSON.parse(fs.readFileSync(file, "utf-8"));
  }

  if (!cidades.find((c) => c.codTSE === cidadeObj.codTSE)) {
    cidades.push(cidadeObj);
    fs.writeFileSync(file, JSON.stringify(cidades, null, 2));
  }
};

const criarWorker = (cidade) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/workerAdapter2024.js", import.meta.url),
      {
        workerData: cidade,
        type: "module",
      }
    );

    worker.on("message", (msg) => {
      if (msg?.ok) return resolve(msg);
      reject(msg?.erro);
    });

    worker.on("error", reject);

    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exit ${code}`));
    });
  });

const mapearCSVJSON = async (caminhos, anoEleicao, callback) => {
  try {
    logger.info(`[Mapeamento CSV-JSON] Iniciando processamento ${anoEleicao}`);

    const { caminhoDetalhe, caminhoCandidatos } = caminhos;

    const detalheIndex = new Map();

    await new Promise((resolve, reject) => {
      fs.createReadStream(caminhoDetalhe)
        .pipe(iconv.decodeStream("win1252"))
        .pipe(csvParser({ separator: ";", quote: '"' }))
        .on("data", (d) => {
          const chave = [
            d.ANO_ELEICAO,
            d.CD_MUNICIPIO,
            d.NR_ZONA,
            d.CD_CARGO,
            d.NR_TURNO,
          ].join("_");

          detalheIndex.set(chave, d);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    logger.info(`[Mapeamento CSV-JSON] Índice detalhe carregado`, {
      total: detalheIndex.size,
    });

    const limiteConcorrencia = 2;
    const fila = [];
    let ativos = 0;
    let cidadesProcessadas = 0;
    let totalCidades = 0;
    let finalizadoLeitura = false;

    const processarFila = async () => {
      if (!fila.length || ativos >= limiteConcorrencia) return;
      const item = fila.shift();
      if (!item) return;

      ativos++;

      const { idCidade, cidade } = item;

      try {
        const msg = await criarWorker(cidade);

        cidadesProcessadas++;

        if (callback)
          callback(cidadesProcessadas, totalCidades, {
            estado: msg?.estado,
            cidade: msg?.cidade,
          });

        if (msg.estado && msg.nomeEstado)
          appendEstado(msg.estado, msg.nomeEstado);

        if (msg.cidade) appendCidade(msg.estado, msg.cidade);

        logger.info(`[Mapeamento CSV-JSON] Cidade processada com sucesso`, {
          idCidade,
        });
      } catch (erro) {
        logger.error(`[Mapeamento CSV-JSON] Erro cidade`, {
          idCidade,
          erro,
        });
      } finally {
        ativos--;
        setImmediate(processarFila);

        if (finalizadoLeitura && ativos === 0 && fila.length === 0) {
          resolverFinal();
        }
      }
    };

    let resolverFinal;
    const promessaFinal = new Promise((resolve) => {
      resolverFinal = resolve;
    });

    let cidadeAtualId = null;
    let cidadeAtual = null;

    const flushCidade = () => {
      if (!cidadeAtual) return;

      fila.push({
        idCidade: cidadeAtualId,
        cidade: cidadeAtual,
      });

      totalCidades++;

      cidadeAtual = null;
      cidadeAtualId = null;

      setImmediate(processarFila);
    };

    await new Promise((resolve, reject) => {
      fs.createReadStream(caminhoCandidatos)
        .pipe(iconv.decodeStream("win1252"))
        .pipe(csvParser({ separator: ";", quote: '"' }))
        .on("data", (cand) => {
          const chave = [
            cand.ANO_ELEICAO,
            cand.CD_MUNICIPIO,
            cand.NR_ZONA,
            cand.CD_CARGO,
            cand.NR_TURNO,
          ].join("_");

          const det = detalheIndex.get(chave);
          if (!det) return;

          const idCidade = [
            cand.CD_ELEICAO,
            cand.CD_MUNICIPIO,
            cand.CD_CARGO,
          ].join("_");

          if (cidadeAtualId !== idCidade) {
            flushCidade();
            cidadeAtualId = idCidade;
            cidadeAtual = { detalhe: det, candidatos: [] };
          }

          cidadeAtual.candidatos.push(cand);
        })
        .on("end", () => {
          flushCidade();
          finalizadoLeitura = true;
          resolve();
        })
        .on("error", reject);
    });

    logger.info(
      `[Mapeamento CSV-JSON] Total de arquivos para processar: ${totalCidades}`
    );

    await promessaFinal;

    logger.info(`[Mapeamento CSV-JSON] Finalizado com sucesso`);
  } catch (erro) {
    logger.error(`[Mapeamento CSV-JSON] Erro geral`, erro);
    throw erro;
  }
};

export default mapearCSVJSON;
