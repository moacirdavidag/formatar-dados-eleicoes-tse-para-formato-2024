import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { Worker } from "worker_threads";
import iconv from "iconv-lite";
import logger from "../logger.config.js";

const WORKERS = 2;

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
  const dir = path.join(process.cwd(), "public");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `cidades_${uf}.json`);
  let cidades = [];
  if (fs.existsSync(file)) {
    cidades = JSON.parse(fs.readFileSync(file, "utf-8"));
  }

  if (!cidades.find((c) => c.codTSE === cidadeObj.codTSE)) {
    cidades.push(cidadeObj);
    fs.writeFileSync(file, JSON.stringify(cidades, null, 2));
  }
};

const criarPool = () => {
  const workers = [];
  for (let i = 0; i < WORKERS; i++) {
    const worker = new Worker(
      new URL("../workers/workerAdapter2024.js", import.meta.url),
      { type: "module" }
    );
    workers.push({ worker, ocupado: false });
  }
  return workers;
};

const mapearCSVJSON = async (caminhos, anoEleicao, callback) => {
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

      const idCidade = [
        cand.CD_ELEICAO,
        cand.CD_MUNICIPIO,
        cand.CD_CARGO,
        cand.NR_TURNO,
      ].join("_");

      if (!cidades.has(idCidade)) {
        cidades.set(idCidade, {
          detalhe: { ...det },
          candidatos: [],
        });
      }

      cidades.get(idCidade).candidatos.push(cand);
    }

    logger.info(
      `[Mapeamento CSV-JSON] Total de arquivos para processar: ${cidades.size}`
    );

    const pool = criarPool();
    const fila = Array.from(cidades.entries()).map(([idCidade, cidade]) => ({
      idCidade,
      cidade,
    }));

    const totalCidades = fila.length;
    let cidadesProcessadas = 0;

    const processarFila = () => {
      for (const slot of pool) {
        if (slot.ocupado) continue;
        const item = fila.shift();
        if (!item) return;

        slot.ocupado = true;

        slot.worker.once("message", (msg) => {
          slot.ocupado = false;

          if (msg?.ok) {
            cidadesProcessadas++;

            if (callback)
              callback(cidadesProcessadas, totalCidades, {
                estado: msg?.estado,
                cidade: msg?.cidade,
              });

            logger.info(`[Mapeamento CSV-JSON] Cidade processada`, {
              idCidade: item.idCidade,
            });

            if (msg.estado && msg.nomeEstado)
              appendEstado(msg.estado, msg.nomeEstado);

            if (msg.cidade && msg.estado) appendCidade(msg.estado, msg.cidade);
          } else {
            logger.error(`[Mapeamento CSV-JSON] Erro cidade`, {
              idCidade: item.idCidade,
              erro: msg?.erro,
            });
          }

          processarFila();
        });

        slot.worker.postMessage(item.cidade);
      }
    };

    await new Promise((resolve) => {
      const check = setInterval(() => {
        const ocupados = pool.some((p) => p.ocupado);
        if (!ocupados && fila.length === 0) {
          clearInterval(check);
          resolve();
        }
      }, 200);

      processarFila();
    });

    for (const p of pool) {
      p.worker.terminate();
    }

    logger.info(`[Mapeamento CSV-JSON] Finalizado com sucesso`);
  } catch (erro) {
    logger.error(`[Mapeamento CSV-JSON] Erro geral`, erro);
    throw erro;
  }
};

export default mapearCSVJSON;
