import fs from "fs";
import path from "path";
import { parentPort } from "worker_threads";
import logger from "../logger.config.js";
import { texto } from "../shared/functions.js";
import ESTADOS_BR from "../shared/estados_BR.js";

const numero = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
};
const percentual = (p, t) => (!t || t === 0 ? null : (p / t) * 100);
const normalizarAbr = (tp) => {
  if (!tp) return null;
  const v = String(tp).toLowerCase();
  if (v === "m") return "mu";
  if (v === "e") return "uf";
  if (v === "f") return "br";
  return v;
};
const formatPct = (n) => (n === null ? null : n.toFixed(2).replace(".", ","));
const formatPctN = (n) => (n === null ? null : String(n));

parentPort.on("message", async (workerData) => {
  try {
    const { detalhe, candidatos } = workerData;

    logger.info(`[Worker] Iniciando processamento`, {
      municipio: detalhe?.NM_MUNICIPIO,
      uf: detalhe?.SG_UF,
      cargo: detalhe?.CD_CARGO,
      turno: detalhe?.NR_TURNO,
    });

    const uf = String(detalhe.SG_UF || "")
      .trim()
      .toUpperCase();
    const nomeUF = ESTADOS_BR[uf] || null;
    const cdMunicipio = detalhe.CD_MUNICIPIO;
    const nrZona = String(detalhe.NR_ZONA || detalhe.CD_ZONA || "0");

    const abrangencia = normalizarAbr(detalhe.TP_ABRANGENCIA);
    const cdCargo = String(detalhe.CD_CARGO);
    const cdEleicao = String(detalhe.CD_ELEICAO);
    const cdEleicaoArquivo = String(detalhe.CD_ELEICAO).padStart(6, "0");

    const baseData = path.join(
      process.cwd(),
      "public",
      `ele${detalhe.ANO_ELEICAO}`,
      cdEleicao,
      "dados",
      uf.toLowerCase()
    );
    fs.mkdirSync(baseData, { recursive: true });

    const nomeArquivoCidade = `${uf.toLowerCase()}${cdMunicipio}-c${cdCargo.padStart(
      4,
      "0"
    )}-e${cdEleicaoArquivo}-u.json`;
    const caminhoArquivoCidade = path.join(baseData, nomeArquivoCidade);

    const nomeArquivoZona = `${uf.toLowerCase()}${cdMunicipio}-z${nrZona.padStart(
      4,
      "0"
    )}-c${cdCargo.padStart(4, "0")}-e${cdEleicaoArquivo}-u.json`;
    const caminhoArquivoZona = path.join(baseData, nomeArquivoZona);

    const totalAptos = numero(detalhe.QT_APTOS);
    const comparecimento = numero(detalhe.QT_COMPARECIMENTO);
    const abstencao =
      numero(detalhe.QT_ABSTENCOES) || Math.max(totalAptos - comparecimento, 0);

    const votosBrancos = numero(detalhe.QT_VOTOS_BRANCOS);
    const votosNulos = numero(detalhe.QT_VOTOS_NULOS);

    const candidatosMap = new Map();
    for (const cand of candidatos) {
      const sq = String(cand.SQ_CANDIDATO);
      const votosCand =
        numero(cand.QT_VOTOS_NOMINAIS_VALIDOS) +
        numero(cand.QT_VOTOS_NOM_CONVR_LEG_VALIDOS);
      if (!candidatosMap.has(sq)) {
        candidatosMap.set(sq, {
          ...cand,
          QT_VOTOS_NOMINAIS_VALIDOS: votosCand,
        });
      } else {
        const existente = candidatosMap.get(sq);
        existente.QT_VOTOS_NOMINAIS_VALIDOS += votosCand;
      }
    }

    const votosValidos = Array.from(candidatosMap.values()).reduce(
      (s, c) => s + numero(c.QT_VOTOS_NOMINAIS_VALIDOS),
      0
    );

    const totalVotos = votosValidos + votosBrancos + votosNulos;

    const partidos = new Map();
    for (const cand of candidatosMap.values()) {
      const nrPartido = cand.NR_PARTIDO || "0";
      if (!partidos.has(nrPartido)) {
        partidos.set(nrPartido, {
          n: nrPartido,
          sg: texto(cand.SG_PARTIDO).toUpperCase(),
          nm: texto(cand.NM_PARTIDO),
          cand: [],
        });
      }
      const votosCand = numero(cand.QT_VOTOS_NOMINAIS_VALIDOS);
      const pctCand = percentual(votosCand, votosValidos);
      partidos.get(nrPartido).cand.push({
        n: cand.NR_CANDIDATO,
        sqcand: cand.SQ_CANDIDATO,
        nm: texto(cand.NM_CANDIDATO),
        nmu: texto(cand.NM_URNA_CANDIDATO),
        sgp: texto(cand.SG_PARTIDO).toUpperCase(),
        dt: null,
        dvt: null,
        seq: null,
        e: null,
        st: null,
        vap: String(votosCand),
        pvap: formatPct(pctCand),
        pvapn: formatPctN(pctCand),
        vs: [],
      });
    }

    const todos = [];
    for (const [, p] of partidos) {
      for (const c of p.cand) todos.push(c);
    }
    todos.sort((a, b) => numero(b.vap) - numero(a.vap));
    todos.forEach((c, idx) => (c.seq = String(idx + 1)));

    const agr = Array.from(partidos.values()).map((p) => {
      const totalPartido = p.cand.reduce((s, c) => s + numero(c.vap), 0);
      return {
        n: null,
        nm: p.nm,
        tp: "i",
        com: p.sg,
        vag: null,
        par: [
          {
            n: p.n,
            sg: p.sg,
            nm: p.nm,
            nfed: "",
            tvtn: String(totalPartido),
            tvtl: "0",
            tval: "0",
            tvan: String(totalPartido),
            cand: p.cand,
          },
        ],
      };
    });

    const pctComp = percentual(comparecimento, totalAptos);
    const pctAbs = percentual(abstencao, totalAptos);
    const pctVV = percentual(votosValidos, totalVotos);
    const pctVB = percentual(votosBrancos, totalVotos);
    const pctVN = percentual(votosNulos, totalVotos);

    const jsonBase = {
      ele: String(cdEleicao),
      t: String(detalhe.NR_TURNO),
      f: "o",
      sup: "n",
      tpabr: abrangencia,
      cdabr: String(cdMunicipio),
      dg: detalhe.DT_GERACAO || null,
      hg: detalhe.HH_GERACAO || null,
      dt: detalhe.DT_ULTIMA_TOTALIZACAO || null,
      ht: detalhe.HH_ULTIMA_TOTALIZACAO || null,
      dv: "s",
      tf: "s",
      and: "f",
      esae: "s",
      mnae: [],
      carg: [
        {
          cd: cdCargo,
          nmn: texto(detalhe.DS_CARGO),
          nmm: texto(detalhe.DS_CARGO),
          nmf: texto(detalhe.DS_CARGO),
          nv: "1",
          fed: [],
          agr,
        },
      ],
      s: null,
      e: {
        te: String(totalAptos),
        c: String(comparecimento),
        pc: formatPct(pctComp),
        pcn: formatPctN(pctComp),
        a: String(abstencao),
        pa: formatPct(pctAbs),
        pan: formatPctN(pctAbs),
      },
      v: {
        tv: String(totalVotos),
        vv: String(votosValidos),
        pvv: formatPct(pctVV),
        pvvn: formatPctN(pctVV),
        vnom: String(votosValidos),
        vl: String(votosValidos),
        vb: String(votosBrancos),
        pvb: formatPct(pctVB),
        pvbn: formatPctN(pctVB),
        vn: String(votosNulos),
        pvn: formatPct(pctVN),
        pvnn: formatPctN(pctVN),
      },
    };

    await fs.promises.writeFile(caminhoArquivoCidade, JSON.stringify(jsonBase));

    logger.info(`[Worker] Arquivo cidade salvo`, {
      caminho: caminhoArquivoCidade,
    });

    const jsonZona = {
      ...jsonBase,
      tpabr: "zona",
      cdabr: nrZona.padStart(4, "0"),
    };
    await fs.promises.writeFile(caminhoArquivoZona, JSON.stringify(jsonZona));

    logger.info(`[Worker] Arquivo zona salvo`, {
      caminho: caminhoArquivoZona,
    });

    const estadoFileName = `${uf.toLowerCase()}-c${cdCargo.padStart(
      4,
      "0"
    )}-e${cdEleicaoArquivo}-e.json`;
    const estadoPath = path.join(baseData, estadoFileName);

    let estadoJSON = {
      ele: cdEleicao,
      cdabr: uf.toLowerCase(),
      nmabr: nomeUF,
      t: detalhe.NR_TURNO,
      f: "o",
      cdcar: cdCargo.padStart(3, "0"),
      nmcar: texto(detalhe.DS_CARGO),
      dg: detalhe.DT_ELEICAO,
      abr: [],
    };

    if (fs.existsSync(estadoPath)) {
      estadoJSON = JSON.parse(await fs.promises.readFile(estadoPath, "utf-8"));
    }

    estadoJSON.abr.push({
      dt: detalhe.DT_ELEICAO || null,
      ht: detalhe.HH_ULTIMA_TOTALIZACAO || null,
      tpabr: "mu",
      cdabr: String(cdMunicipio),
      nmabr: texto(detalhe.NM_MUNICIPIO),
      tvap: String(todos[0]?.vap || 0),
      scv: "n",
      esae: "s",
      mnae: [],
      cand: todos.slice(0, 1),
    });

    await fs.promises.writeFile(estadoPath, JSON.stringify(estadoJSON));

    logger.info(`[Worker] Arquivo estado atualizado`, {
      caminho: estadoPath,
    });

    parentPort.postMessage({
      ok: true,
      estado: uf,
      nomeEstado: nomeUF,
      cidade: {
        codTSE: cdMunicipio,
        nome: String(detalhe.NM_MUNICIPIO || ""),
        zonas:
          nrZona && nrZona !== "0"
            ? [{ [nrZona.padStart(4, "0")]: `${nrZona}ª ZE` }]
            : [],
      },
    });

    logger.info(`[Worker] Processamento concluído`, {
      municipio: detalhe?.NM_MUNICIPIO,
      uf,
    });
  } catch (erro) {
    logger.error(`[Worker] Erro processamento cidade`, {
      erro: erro.message,
      stack: erro.stack,
    });

    parentPort.postMessage({ ok: false, erro: erro.message });
  }
});
