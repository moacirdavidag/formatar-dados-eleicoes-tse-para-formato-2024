import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { Worker } from "worker_threads";
import iconv from "iconv-lite";
import logger from "../logger.config.js";
import { gerarCodigosEleicoes } from "../shared/gerarCodigosEleicoes.js";

const WORKERS = 2;
const BATCH_SIZE = 500;
const workerTotalizacaoPath = new URL(
  "../workers/workerTotalizacao.js",
  import.meta.url
);

const appendEstado = (estadoSigla, nomeEstado) => {
  const dir = path.join(process.cwd(), "public");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "estados.json");
  let estados = [];
  if (fs.existsSync(file)) {
    estados = JSON.parse(fs.readFileSync(file, "utf-8"));
  }
  if (!estados.some((e) => e.sigla === estadoSigla)) {
    estados.push({ sigla: estadoSigla, nome: nomeEstado });
    fs.writeFileSync(file, JSON.stringify(estados, null, 2));
    logger.info(`[Mapeamento CSV-JSON] Estado adicionado`, {
      estado: estadoSigla,
      nome: nomeEstado,
    });
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
  const idx = cidades.findIndex((c) => c.codTSE === cidadeObj.codTSE);
  if (idx >= 0) {
    cidadeObj.zonas?.forEach((z) => {
      const key = Object.keys(z)[0];
      if (!cidades[idx].zonas.some((cz) => Object.keys(cz)[0] === key)) {
        cidades[idx].zonas.push(z);
      }
    });
    cidades[idx] = { ...cidades[idx], ...cidadeObj };
  } else {
    cidades.push(cidadeObj);
  }
  fs.writeFileSync(file, JSON.stringify(cidades, null, 2));
  logger.info(`[Mapeamento CSV-JSON] Cidade adicionada/atualizada`, {
    uf,
    codTSE: cidadeObj.codTSE,
    zonas: cidadeObj.zonas,
  });
};

const criarPool = (anoEleicao) => {
  logger.info(`[Mapeamento CSV-JSON] Criando pool de workers`, {
    totalWorkers: WORKERS,
  });
  const workers = [];
  for (let i = 0; i < WORKERS; i++) {
    const workerPath =
      Number(anoEleicao) === 2024
        ? new URL("../workers/workerAdapterEA20.js", import.meta.url)
        : Number(anoEleicao) === 2012
        ? new URL("../workers/workerEleicoes2012.js", import.meta.url)
        : new URL("../workers/workerAdapterEA10.js", import.meta.url);
  
    workers.push({
      worker: new Worker(workerPath, { type: "module" }),
      ocupado: false,
    });
  }
  return workers;
};

const streamDetalhe = (arquivo) =>
  new Promise((resolve, reject) => {
    logger.info(`[Mapeamento CSV-JSON] Indexando detalhe`, { arquivo });
    const detalheIndex = new Map();
    const norm = (v) => String(Number(v || 0));
    fs.createReadStream(arquivo)
      .pipe(iconv.decodeStream("win1252"))
      .pipe(csvParser({ separator: ";", quote: '"' }))
      .on("data", (d) => {
        const chave = [
          norm(d.ANO_ELEICAO),
          norm(d.CD_MUNICIPIO),
          norm(d.NR_ZONA),
          norm(d.CD_CARGO),
          norm(d.NR_TURNO),
        ].join("_");
        detalheIndex.set(chave, d);
      })
      .on("end", () => {
        logger.info(`[Mapeamento CSV-JSON] Detalhe indexado`, {
          total: detalheIndex.size,
        });
        resolve(detalheIndex);
      })
      .on("error", reject);
  });

const mapearCSVJSON = async (caminhos, anoEleicao, callback) => {
  try {
    logger.info(`[Mapeamento CSV-JSON] Iniciando processamento`, {
      anoEleicao,
    });
    const { caminhoDetalhe, caminhoCandidatos } = caminhos;
    const detalheIndex = await streamDetalhe(caminhoDetalhe);
    const pool = criarPool(anoEleicao);
    const totalizacaoWorker = new Worker(workerTotalizacaoPath, {
      type: "module",
    });
    const norm = (v) => String(Number(v || 0));
    const cidades = new Map();
    let totalCidades = 0;
    let cidadesProcessadas = 0;


    const enviarWorker = (item) =>
      new Promise((resolve) => {
        const tentar = () => {
          const slot = pool.find((s) => !s.ocupado);
          if (!slot) return setImmediate(tentar);
          slot.ocupado = true;
          slot.worker.once("message", async (msg) => {
            slot.ocupado = false;
            if (msg?.ok) {
              cidadesProcessadas++;
              if (callback)
                callback(cidadesProcessadas, totalCidades, {
                  estado: msg?.estado,
                  cidade: msg?.cidade,
                });
              if (msg.estado && msg.nomeEstado)
                appendEstado(msg.estado, msg.nomeEstado);
              if (msg.cidade && msg.estado)
                appendCidade(msg.estado, msg.cidade);
              await new Promise((res) => {
                totalizacaoWorker.once("message", () => res());
                totalizacaoWorker.postMessage(item.cidade);
              });
            } else {
              logger.error(`[Mapeamento CSV-JSON] Erro cidade`, {
                idCidade: item.idCidade,
                erro: msg?.erro,
              });
            }
            resolve();
          });
          slot.worker.postMessage(item.cidade);
        };
        tentar();
      });

    const flushCidade = async (idCidade) => {
      const cidade = cidades.get(idCidade);
      if (!cidade) return;
      cidades.delete(idCidade);
      await enviarWorker({ idCidade, cidade });
    };

    await new Promise((resolve, reject) => {
      const stream = fs
        .createReadStream(caminhoCandidatos)
        .pipe(iconv.decodeStream("win1252"))
        .pipe(csvParser({ separator: ";", quote: '"' }));

      stream.on("data", async (cand) => {
        stream.pause();
        try {
          const chave = [
            norm(cand.ANO_ELEICAO),
            norm(cand.CD_MUNICIPIO),
            norm(cand.NR_ZONA),
            norm(cand.CD_CARGO),
            norm(cand.NR_TURNO),
          ].join("_");
          const det = detalheIndex.get(chave);
          if (!det) {
            logger.error(`[Mapeamento CSV-JSON] Detalhe não encontrado`, cand);
            stream.resume();
            return;
          }
          const idCidade = [
            cand.CD_ELEICAO,
            cand.CD_MUNICIPIO,
            cand.CD_CARGO,
            cand.NR_TURNO,
          ].join("_");
          if (!cidades.has(idCidade)) {
            cidades.set(idCidade, { detalhe: { ...det }, candidatos: [] });
            totalCidades++;
          }
          const cidadeObj = cidades.get(idCidade);
          cidadeObj.candidatos.push(cand);
          if (cidadeObj.candidatos.length >= BATCH_SIZE)
            await flushCidade(idCidade);
        } catch (err) {
          logger.error(`[Mapeamento CSV-JSON] Erro processamento linha`, err);
        }
        stream.resume();
      });

      stream.on("end", async () => {
        for (const idCidade of cidades.keys()) await flushCidade(idCidade);
        resolve();
      });

      stream.on("error", reject);
    });

    for (const p of pool) p.worker.terminate();
    await totalizacaoWorker.terminate();
    await gerarCodigosEleicoes();
    logger.info(`[Mapeamento CSV-JSON] Finalizado com sucesso`, { anoEleicao });
  } catch (erro) {
    logger.error(`[Mapeamento CSV-JSON] Erro geral`, erro);
    throw erro;
  }
};

export default mapearCSVJSON;
