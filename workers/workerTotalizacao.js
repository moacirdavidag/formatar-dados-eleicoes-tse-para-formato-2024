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

const formatPct = (n) => (n === null ? null : n.toFixed(2).replace(".", ","));
const formatPctN = (n) => (n === null ? null : String(n));
const percentual = (p, t) => (!t || t === 0 ? null : (p / t) * 100);

const acquireLock = async (lockPath) => {
  const timeout = Date.now() + 30000;

  while (true) {
    try {
      const fd = await fs.promises.open(lockPath, "wx");
      await fd.close();
      break;
    } catch {
      if (Date.now() > timeout) {
        await fs.promises.unlink(lockPath).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  }
};

const releaseLock = async (lockPath) => {
  try {
    await fs.promises.unlink(lockPath);
  } catch {}
};

const carregarJSON = async (file) => {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(await fs.promises.readFile(file, "utf-8"));
};

const recalcular = (estrutura) => {
  const candidatos = estrutura.carg.agr[0].par[0].cand;

  let votosValidos = 0;
  candidatos.forEach((c) => (votosValidos += numero(c.vap)));

  candidatos.forEach((c) => {
    const pct = percentual(numero(c.vap), votosValidos);
    c.pvap = formatPct(pct);
    c.pvapn = formatPctN(pct);
  });

  candidatos.sort((a, b) => numero(b.vap) - numero(a.vap));
  candidatos.forEach((c, i) => (c.seq = String(i + 1)));

  estrutura.v = String(
    votosValidos + numero(estrutura.brancos) + numero(estrutura.nulos)
  );

  estrutura.pctAbst = formatPct(
    percentual(numero(estrutura.abstencao), numero(estrutura.aptos))
  );
};

parentPort.on("message", async (workerData) => {
  try {
    const { detalhe, candidatos } = workerData;

    const cdCargo = String(detalhe.CD_CARGO);
    if (cdCargo !== "1" && cdCargo !== "3") {
      parentPort.postMessage({ ok: true });
      return;
    }

    const uf = String(detalhe.SG_UF).toUpperCase();
    const nomeUF = ESTADOS_BR[uf];
    const cdEleicao = String(detalhe.CD_ELEICAO);
    const cdEleicaoArquivo = cdEleicao.padStart(6, "0");
    const ano = detalhe.ANO_ELEICAO;

    const totalAptos = numero(detalhe.QT_APTOS);
    const comparecimento = numero(detalhe.QT_COMPARECIMENTO);
    const abstencao =
      numero(detalhe.QT_ABSTENCOES) || Math.max(totalAptos - comparecimento, 0);

    const votosBrancos = numero(detalhe.QT_VOTOS_BRANCOS);
    const votosNulos = numero(detalhe.QT_VOTOS_NULOS);

    const mapaMunicipio = new Map();
    candidatos.forEach((cand) => {
      mapaMunicipio.set(String(cand.SQ_CANDIDATO), {
        ...cand,
        QT_VOTOS_NOMINAIS_VALIDOS: numero(cand.QT_VOTOS_NOMINAIS_VALIDOS),
      });
    });

    const baseUF = path.join(
      process.cwd(),
      "public",
      `ele${ano}`,
      cdEleicao,
      "dados",
      uf.toLowerCase()
    );

    await fs.promises.mkdir(baseUF, { recursive: true });

    const fileUF = path.join(
      baseUF,
      `${uf.toLowerCase()}-c${cdCargo.padStart(
        4,
        "0"
      )}-e${cdEleicaoArquivo}-${cdEleicao}-f.json`
    );

    const lockUF = `${fileUF}.lock`;
    await acquireLock(lockUF);

    let estruturaUF = await carregarJSON(fileUF);

    if (!estruturaUF) {
      estruturaUF = {
        ele: cdEleicao,
        cdabr: uf,
        nmabr: nomeUF,
        t: String(detalhe.NR_TURNO),
        f: "O",
        s: "N",
        dg: detalhe.DT_GERACAO,
        hg: detalhe.HH_GERACAO,
        aptos: 0,
        comparecimento: 0,
        abstencao: 0,
        brancos: 0,
        nulos: 0,
        carg: {
          cd: cdCargo.replace(/^0+/, ""),
          nmn: texto(detalhe.DS_CARGO),
          nmm: texto(detalhe.DS_CARGO),
          nmf: texto(detalhe.DS_CARGO),
          nv: "1",
          fed: [],
          agr: [
            {
              n: null,
              nm: texto(detalhe.DS_CARGO),
              tp: "C",
              com: "",
              par: [{ n: null, sg: "", nm: "", nfed: "", cand: [] }],
            },
          ],
        },
      };
    }

    estruturaUF.aptos += totalAptos;
    estruturaUF.comparecimento += comparecimento;
    estruturaUF.abstencao += abstencao;
    estruturaUF.brancos += votosBrancos;
    estruturaUF.nulos += votosNulos;

    const mapaEstado = new Map();
    estruturaUF.carg.agr[0].par[0].cand.forEach((c) =>
      mapaEstado.set(c.sqcand, c)
    );

    mapaMunicipio.forEach((cand, sq) => {
      const atual = mapaEstado.get(sq);
      if (atual) {
        atual.vap = String(numero(atual.vap) + cand.QT_VOTOS_NOMINAIS_VALIDOS);
      } else {
        mapaEstado.set(sq, {
          n: cand.NR_CANDIDATO,
          sqcand: sq,
          nm: texto(cand.NM_CANDIDATO),
          nmu: texto(cand.NM_URNA_CANDIDATO),
          sgp: texto(cand.SG_PARTIDO).toUpperCase(),
          dt: null,
          dvt: texto(cand.NM_TIPO_DESTINACAO_VOTOS),
          seq: null,
          e: texto(cand.DS_SIT_TOT_TURNO)?.includes("Eleito") ? "S" : "N",
          st: texto(cand.DS_SIT_TOT_TURNO),
          vap: String(cand.QT_VOTOS_NOMINAIS_VALIDOS),
          pvap: null,
          pvapn: null,
          vs: [],
        });
      }
    });

    estruturaUF.carg.agr[0].par[0].cand = Array.from(mapaEstado.values());

    recalcular(estruturaUF);

    await fs.promises.writeFile(fileUF, JSON.stringify(estruturaUF));
    await releaseLock(lockUF);

    logger.info(`[Totalizacao] UF acumulada`, { uf, cargo: cdCargo });

    if (cdCargo === "0001") {
      const baseBR = path.join(
        process.cwd(),
        "public",
        `ele${ano}`,
        cdEleicao,
        "dados",
        "br"
      );

      await fs.promises.mkdir(baseBR, { recursive: true });

      const fileBR = path.join(
        baseBR,
        `br-c${cdCargo.padStart(
          4,
          "0"
        )}-e${cdEleicaoArquivo}-${cdEleicao}-f.json`
      );

      const lockBR = `${fileBR}.lock`;
      await acquireLock(lockBR);

      let estruturaBR = await carregarJSON(fileBR);

      if (!estruturaBR) estruturaBR = JSON.parse(JSON.stringify(estruturaUF));
      else {
        estruturaBR.aptos += totalAptos;
        estruturaBR.comparecimento += comparecimento;
        estruturaBR.abstencao += abstencao;
        estruturaBR.brancos += votosBrancos;
        estruturaBR.nulos += votosNulos;

        const mapaBR = new Map();
        estruturaBR.carg.agr[0].par[0].cand.forEach((c) =>
          mapaBR.set(c.sqcand, c)
        );

        estruturaUF.carg.agr[0].par[0].cand.forEach((cand) => {
          const atual = mapaBR.get(cand.sqcand);
          if (atual) atual.vap = String(numero(atual.vap) + numero(cand.vap));
          else mapaBR.set(cand.sqcand, { ...cand });
        });

        estruturaBR.carg.agr[0].par[0].cand = Array.from(mapaBR.values());
      }

      recalcular(estruturaBR);

      await fs.promises.writeFile(fileBR, JSON.stringify(estruturaBR));
      await releaseLock(lockBR);

      logger.info(`[Totalizacao] BR acumulado`, { cargo: cdCargo });
    }

    parentPort.postMessage({ ok: true });
  } catch (erro) {
    logger.error(`[Totalizacao] Erro`, {
      erro: erro.message,
      stack: erro.stack,
    });
    parentPort.postMessage({ ok: false });
  }
});
