import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import { Worker } from "worker_threads";
import iconv from "iconv-lite";
import logger from "../logger.config.js";
import { gerarCodigosEleicoes } from "../shared/gerarCodigosEleicoes.js";

const WORKERS = 2;

const lerCSV = (arquivo) =>
  new Promise((resolve, reject) => {
    logger.info(`[Mapeamento CSV-JSON] Lendo CSV`, { arquivo });

    const dados = [];

    fs.createReadStream(arquivo)
      .pipe(iconv.decodeStream("win1252"))
      .pipe(csvParser({ separator: ";", quote: '"' }))
      .on("data", (row) => dados.push(row))
      .on("end", () => {
        logger.info(`[Mapeamento CSV-JSON] CSV carregado`, {
          arquivo,
          totalRegistros: dados.length,
        });
        resolve(dados);
      })
      .on("error", (err) => {
        logger.error(`[Mapeamento CSV-JSON] Erro ao ler CSV`, {
          arquivo,
          erro: err,
        });
        reject(err);
      });
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

  const cidadeExistente = cidades.find((c) => c.codTSE === cidadeObj.codTSE);

  if (cidadeExistente) {
    cidadeExistente.zonas = cidadeExistente.zonas || [];
    for (const z of cidadeObj.zonas || []) {
      const key = Object.keys(z)[0];
      if (!cidadeExistente.zonas.some((cz) => Object.keys(cz)[0] === key)) {
        cidadeExistente.zonas.push(z);
      }
    }
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

const criarPool = () => {
  logger.info(`[Mapeamento CSV-JSON] Criando pool de workers`, {
    totalWorkers: WORKERS,
  });

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
    logger.info(`[Mapeamento CSV-JSON] Iniciando processamento`, {
      anoEleicao,
    });

    const { caminhoDetalhe, caminhoCandidatos } = caminhos;

    const detalhe = await lerCSV(caminhoDetalhe);
    const candidatos = await lerCSV(caminhoCandidatos);

    logger.info(`[Mapeamento CSV-JSON] Indexando detalhes`);

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

    logger.info(`[Mapeamento CSV-JSON] Agrupando candidatos por cidade`);

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

    logger.info(`[Mapeamento CSV-JSON] Total de arquivos para processar`, {
      total: cidades.size,
    });

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

        logger.info(`[Mapeamento CSV-JSON] Enviando cidade para worker`, {
          idCidade: item.idCidade,
        });

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
              progresso: `${cidadesProcessadas}/${totalCidades}`,
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

    logger.info(`[Mapeamento CSV-JSON] Encerrando workers`);

    for (const p of pool) {
      p.worker.terminate();
    }

    logger.info(`[Mapeamento CSV-JSON] Gerando codigos_eleicoes.json`);

    await gerarCodigosEleicoes();

    logger.info(`[Mapeamento CSV-JSON] Finalizado com sucesso`, {
      anoEleicao,
    });
  } catch (erro) {
    logger.error(`[Mapeamento CSV-JSON] Erro geral`, erro);
    throw erro;
  }
};

export default mapearCSVJSON;
