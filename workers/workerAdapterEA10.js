import fs from "fs";
import path from "path";
import { parentPort } from "worker_threads";
import logger from "../logger.config.js";
import { texto } from "../shared/functions.js";
import ESTADOS_BR from "../shared/estados_BR.js";

const atualizarCodigosEleicoes = async (anoEleicao, cdEleicao, turno, cdCargo, dsCargo) => {
  const caminho = path.join(process.cwd(), "public", "js", "codigos_eleicoes.json");

  await fs.promises.mkdir(path.dirname(caminho), { recursive: true });

  let dados = {};

  try {
    const conteudo = await fs.promises.readFile(caminho, "utf8");
    dados = JSON.parse(conteudo);
  } catch (_) {}

  const ano = Number(anoEleicao);
  const t = Number(turno);
  const cd = Number(cdCargo);

  if (!dados[ano]) {
    dados[ano] = { turnos: {}, cargos: {} };
  }

  if (!dados[ano].turnos[t] || dados[ano].turnos[t] === null) {
    dados[ano].turnos[t] = Number(cdEleicao);
  }

  if (!dados[ano].cargos[cd]) {
    dados[ano].cargos[cd] = nomeCargo(cdCargo) || texto(dsCargo);
  }

  await fs.promises.writeFile(caminho, JSON.stringify(dados, null, 2), "utf8");
};

const numero = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
};

const percentual = (p, t) => (!t || t === 0 ? null : (p / t) * 100);
const formatPct = (n) => (n === null ? null : n.toFixed(2).replace(".", ","));
const formatPctN = (n) => (n === null ? null : String(n));

const normalizarAbr = (tp) => {
  if (!tp) return null;
  const v = String(tp).toLowerCase();
  if (v === "m") return "mu";
  if (v === "e") return "uf";
  if (v === "f") return "br";
  return v;
};

const sqValido = (sq) => {
  if (!sq) return false;
  const s = String(sq);
  if (s.includes("E") || s.includes("e") || s.includes(",")) return false;
  return /^\d+$/.test(s);
};

const gerarSq = (cand, detalhe) => {
  const raw = cand?.SQ_CANDIDATO;
  if (sqValido(raw)) return String(raw);

  const alt = cand?.SQ_CANDIDATO_ORIGINAL;
  if (sqValido(alt)) return String(alt);

  const base = [
    detalhe?.ANO_ELEICAO,
    detalhe?.CD_ELEICAO,
    cand?.NR_CANDIDATO,
    detalhe?.SG_UF,
  ]
    .filter(Boolean)
    .join("");

  if (base) return base;
  return String(cand?.NR_CANDIDATO || Date.now());
};

const registrarErro = async (anoEleicao, cdEleicao, contexto, erro) => {
  try {
    const dirLog = path.join(
      process.cwd(),
      "logs",
      `ele${anoEleicao}`,
      String(cdEleicao)
    );
    await fs.promises.mkdir(dirLog, { recursive: true });

    const arquivoLog = path.join(dirLog, "erros.log");
    const linha =
      JSON.stringify({
        ts: new Date().toISOString(),
        ...contexto,
        erro: erro.message,
      }) + "\n";

    await fs.promises.appendFile(arquivoLog, linha, "utf8");
  } catch (_) {}
};

const acumularTemp = async (caminhoTemp, entrada) => {
  let acumulado = [];

  try {
    const conteudo = await fs.promises.readFile(caminhoTemp, "utf8");
    acumulado = JSON.parse(conteudo);
  } catch (_) {}

  acumulado.push(entrada);

  await fs.promises.writeFile(caminhoTemp, JSON.stringify(acumulado), "utf8");
};

const IBGE_CACHE_DIR = path.join(process.cwd(), "tmp", "ibge-cache");

const buscarCodigoIBGE = async (nmMunicipio, sgUF) => {
  await fs.promises.mkdir(IBGE_CACHE_DIR, { recursive: true });

  const caminhoCache = path.join(IBGE_CACHE_DIR, `${sgUF.toLowerCase()}.json`);

  let lista = null;

  try {
    const cached = await fs.promises.readFile(caminhoCache, "utf8");
    lista = JSON.parse(cached);
  } catch (_) {}

  if (!lista) {
    try {
      const res = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sgUF}/municipios`
      );
      if (!res.ok) return null;
      lista = await res.json();
      await fs.promises.writeFile(caminhoCache, JSON.stringify(lista), "utf8");
    } catch (_) {
      return null;
    }
  }

  const normalizar = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const encontrado = lista.find(
    (m) => normalizar(m.nome) === normalizar(nmMunicipio)
  );

  return encontrado ? String(encontrado.id) : null;
};

const atualizarMunCm = async (
  anoEleicao,
  cdEleicao,
  cdEleicaoArquivo,
  dgGeracao,
  hgGeracao,
  ufSigla,
  nomeUF,
  cdMunicipio,
  nmMunicipio,
  nrZona,
  cdi
) => {
  const dirConfig = path.join(
    process.cwd(),
    "public",
    `ele${anoEleicao}`,
    cdEleicao,
    "config"
  );

  await fs.promises.mkdir(dirConfig, { recursive: true });

  const caminhoMunCm = path.join(dirConfig, `mun-e${cdEleicaoArquivo}-cm.json`);

  let munCm = {
    dg: dgGeracao || null,
    hg: hgGeracao || null,
    f: "o",
    abr: [],
  };

  try {
    const conteudo = await fs.promises.readFile(caminhoMunCm, "utf8");
    munCm = JSON.parse(conteudo);
  } catch (_) {}

  const ufKey = ufSigla.toLowerCase();
  let abr = munCm.abr.find((a) => a.cd === ufKey);

  if (!abr) {
    abr = { cd: ufKey, ds: nomeUF || ufSigla, mu: [] };
    munCm.abr.push(abr);
  }

  let mu = abr.mu.find((m) => m.cd === cdMunicipio);

  const zonaFormatada =
    nrZona && nrZona !== "0" ? nrZona.padStart(4, "0") : null;

  if (!mu) {
    mu = {
      cd: cdMunicipio,
      cdi: cdi || null,
      nm: nmMunicipio,
      c: "s",
      z: zonaFormatada ? [zonaFormatada] : [],
    };
    abr.mu.push(mu);
  } else {
    if (cdi && !mu.cdi) mu.cdi = cdi;
    if (zonaFormatada && !mu.z.includes(zonaFormatada)) {
      mu.z.push(zonaFormatada);
    }
  }

  munCm.abr.sort((a, b) => a.cd.localeCompare(b.cd));
  abr.mu.sort((a, b) => a.nm.localeCompare(b.nm));

  await fs.promises.writeFile(caminhoMunCm, JSON.stringify(munCm), "utf8");
};

const construirSecoes = (detalhe) => {
  const totalSecoes = numero(detalhe.QT_TOTAL_SECOES);
  const naoInstaladas = numero(detalhe.QT_SECOES_NAO_INSTALADAS);
  const principais = numero(detalhe.QT_SECOES_PRINCIPAIS);
  const agregadas = numero(detalhe.QT_SECOES_AGREGADAS);

  const instaladas = principais + agregadas;
  const totalizadas = instaladas - naoInstaladas;
  const naoTotalizadas = totalSecoes - totalizadas;

  const pst = percentual(totalizadas, totalSecoes);
  const psnt = percentual(naoTotalizadas, totalSecoes);
  const psi = percentual(instaladas, totalSecoes);
  const psni = percentual(naoInstaladas, totalSecoes);
  const psa = percentual(totalizadas, instaladas);

  return {
    ts: String(totalSecoes),
    st: String(totalizadas),
    pst: formatPct(pst),
    pstn: formatPctN(pst),
    snt: String(naoTotalizadas),
    psnt: formatPct(psnt),
    psntn: formatPctN(psnt),
    si: String(instaladas),
    psi: formatPct(psi),
    psin: formatPctN(psi),
    sni: String(naoInstaladas),
    psni: formatPct(psni),
    psnin: formatPctN(psni),
    sa: String(totalizadas),
    psa: formatPct(psa),
    psan: formatPctN(psa),
    sna: "0",
    psna: formatPct(0),
    psnan: formatPctN(0),
  };
};

const construirEleitorado = (
  detalhe,
  totalAptos,
  comparecimento,
  abstencao
) => {
  const pctComp = percentual(comparecimento, totalAptos);
  const pctAbs = percentual(abstencao, totalAptos);

  return {
    te: String(totalAptos),
    est: null,
    pest: null,
    pestn: null,
    esnt: String(numero(detalhe.QT_ELEITORES_SECOES_NAO_INSTALADAS)),
    pesnt: null,
    pesntn: null,
    esi: null,
    pesi: null,
    pesin: null,
    esni: null,
    pesni: null,
    pesnin: null,
    esa: null,
    pesa: null,
    pesan: null,
    esna: null,
    pesna: null,
    pesnan: null,
    c: String(comparecimento),
    pc: formatPct(pctComp),
    pcn: formatPctN(pctComp),
    a: String(abstencao),
    pa: formatPct(pctAbs),
    pan: formatPctN(pctAbs),
  };
};

const construirVotos = (
  detalhe,
  votosValidos,
  totalVotos,
  votosBrancos,
  votosNulos
) => {
  const votosNomiaisValidos = numero(detalhe.QT_VOTOS_NOMINAIS_VALIDOS);
  const votosLegendaValidos = numero(detalhe.QT_TOTAL_VOTOS_LEG_VALIDOS);
  const votosAnulados = numero(detalhe.QT_TOTAL_VOTOS_ANULADOS);
  const votosAnuladosSubJudice = numero(detalhe.QT_TOTAL_VOTOS_ANUL_SUBJUD);
  const votosConcorrentes = numero(detalhe.QT_VOTOS_CONCORRENTES);
  const votosNulosTec = numero(detalhe.QT_VOTOS_NULOS_TECNICOS);
  const totalVotosNulos = votosNulos + votosNulosTec;

  const pctVV = percentual(votosValidos, totalVotos);
  const pctVB = percentual(votosBrancos, totalVotos);
  const pctVN = percentual(totalVotosNulos, totalVotos);
  const pctVNom = percentual(votosNomiaisValidos, votosValidos);
  const pctVLeg = percentual(votosLegendaValidos, votosValidos);
  const pctVAn = percentual(votosAnulados, votosConcorrentes);
  const pctVAnSJ = percentual(votosAnuladosSubJudice, votosConcorrentes);
  const pctVVC = percentual(votosConcorrentes, totalVotos);

  return {
    tv: String(totalVotos),
    vvc: String(votosConcorrentes),
    pvvc: formatPct(pctVVC),
    pvvcn: formatPctN(pctVVC),
    vv: String(votosValidos),
    pvv: formatPct(pctVV),
    pvvn: formatPctN(pctVV),
    vnom: String(votosNomiaisValidos),
    pvnom: formatPct(pctVNom),
    pvnomn: formatPctN(pctVNom),
    vl: String(votosLegendaValidos),
    pvl: formatPct(pctVLeg),
    pvln: formatPctN(pctVLeg),
    van: String(votosAnulados),
    pvan: formatPct(pctVAn),
    pvann: formatPctN(pctVAn),
    vansj: String(votosAnuladosSubJudice),
    pvansj: formatPct(pctVAnSJ),
    pvansjn: formatPctN(pctVAnSJ),
    vb: String(votosBrancos),
    pvb: formatPct(pctVB),
    pvbn: formatPctN(pctVB),
    tvn: String(totalVotosNulos),
    ptvn: formatPct(pctVN),
    ptvnn: formatPctN(pctVN),
    vn: String(votosNulos),
    pvn: formatPct(percentual(votosNulos, totalVotosNulos)),
    pvnn: formatPctN(percentual(votosNulos, totalVotosNulos)),
    vnt: String(votosNulosTec),
    pvnt: formatPct(percentual(votosNulosTec, totalVotosNulos)),
    pvntn: formatPctN(percentual(votosNulosTec, totalVotosNulos)),
    vscv: "0",
  };
};

const NOMES_CARGO = {
  1: "Presidente",
  3: "Governador",
  5: "Senador",
  6: "Deputado Federal",
  7: "Deputado Estadual",
  8: "Deputado Distrital",
  11: "Prefeito",
  13: "Vereador",
};

const nomeCargo = (cd) => NOMES_CARGO[String(Number(cd))] || texto(cd);

const atualizarEleitos = async (
  baseData,
  ufSigla,
  nomeUF,
  cdCargo,
  cdEleicaoArquivo,
  cdEleicao,
  turno,
  dgGeracao,
  hgGeracao,
  dtTotalizacao,
  htTotalizacao,
  cdMunicipio,
  nmMunicipio,
  totalVotosValidos,
  existeEleito,
  eleitos,
  partidos,
  federacoesMap
) => {
  const cdCargoArquivo = String(cdCargo).padStart(4, "0");
  const caminho = path.join(
    baseData,
    `${ufSigla.toLowerCase()}-c${cdCargoArquivo}-e${cdEleicaoArquivo}-e.json`
  );

  let json = {
    ele: cdEleicao,
    cdabr: ufSigla.toLowerCase(),
    nmabr: nomeUF || ufSigla,
    t: String(turno),
    f: "o",
    cdcar: String(Number(cdCargo)),
    nmcar: nomeCargo(cdCargo),
    dg: dgGeracao || null,
    hg: hgGeracao || null,
    abr: [],
  };

  try {
    const conteudo = await fs.promises.readFile(caminho, "utf8");
    json = JSON.parse(conteudo);
  } catch (_) {}

  const jaExiste = json.abr.some((a) => a.cdabr === cdMunicipio);
  if (jaExiste) {
    await fs.promises.writeFile(caminho, JSON.stringify(json), "utf8");
    return;
  }

  const candEleitos = eleitos.map((c) => {
    const nrPartido = [...partidos.entries()].find(([, p]) =>
      p.cand.some((x) => x.sqcand === c.sqcand)
    )?.[0];

    const partido = partidos.get(nrPartido);

    let com = partido?.sg || null;
    if (partido?.nrFed) {
      const fed = federacoesMap.get(partido.nrFed);
      if (fed) com = fed.com || fed.sg || com;
    }

    return {
      n: c.n,
      sqcand: c.sqcand,
      nm: c.nm,
      nmu: c.nmu,
      sgp: partido?.sg || null,
      com,
      vap: c.vap,
      seq: c.seq,
      vs: c.vs || [],
    };
  });

  json.abr.push({
    dt: dtTotalizacao || null,
    ht: htTotalizacao || null,
    tpabr: "mu",
    cdabr: cdMunicipio,
    nmabr: nmMunicipio,
    tvap: String(totalVotosValidos),
    scv: "n",
    esae: existeEleito ? "n" : "s",
    mnae: [],
    cand: candEleitos,
  });

  json.abr.sort((a, b) => a.cdabr.localeCompare(b.cdabr));

  await fs.promises.writeFile(caminho, JSON.stringify(json), "utf8");
};

const atualizarAbrangencia = async (
  baseData,
  ufSigla,
  cdEleicaoArquivo,
  cdEleicao,
  turno,
  dgGeracao,
  hgGeracao,
  dtTotalizacao,
  htTotalizacao,
  cdMunicipio,
  secoes,
  eleitorado,
  totalAptos,
  comparecimento,
  abstencao
) => {
  const caminho = path.join(
    baseData,
    `${ufSigla.toLowerCase()}-e${cdEleicaoArquivo}-ab.json`
  );

  let json = {
    ele: cdEleicao,
    t: String(turno),
    f: "o",
    dg: dgGeracao || null,
    hg: hgGeracao || null,
    abr: [],
  };

  try {
    const conteudo = await fs.promises.readFile(caminho, "utf8");
    json = JSON.parse(conteudo);
  } catch (_) {}

  const jaExiste = json.abr.some((a) => a.cdabr === cdMunicipio);
  if (jaExiste) {
    await fs.promises.writeFile(caminho, JSON.stringify(json), "utf8");
    return;
  }

  const pctComp = percentual(comparecimento, totalAptos);
  const pctAbs = percentual(abstencao, totalAptos);

  json.abr.push({
    and: "f",
    tpabr: "mun",
    cdabr: cdMunicipio,
    dt: dtTotalizacao || null,
    ht: htTotalizacao || null,
    s: secoes,
    e: {
      te: String(totalAptos),
      est: secoes.st ? String(totalAptos) : null,
      pest: secoes.st ? "100,00" : null,
      pestn: secoes.st ? "100" : null,
      esnt: eleitorado.esnt || "0",
      pesnt: "0,00",
      pesntn: "0",
      esi: String(totalAptos),
      pesi: "100,00",
      pesin: "100",
      esni: "0",
      pesni: "0,00",
      pesnin: "0",
      esa: String(totalAptos),
      pesa: "100,00",
      pesan: "100",
      esna: "0",
      pesna: "0,00",
      pesnan: "0",
      c: String(comparecimento),
      pc: formatPct(pctComp),
      pcn: formatPctN(pctComp),
      a: String(abstencao),
      pa: formatPct(pctAbs),
      pan: formatPctN(pctAbs),
    },
  });

  json.abr.sort((a, b) => a.cdabr.localeCompare(b.cdabr));

  await fs.promises.writeFile(caminho, JSON.stringify(json), "utf8");
};

parentPort.on("message", async (workerData) => {
  const { detalhe, candidatos } = workerData;

  const anoEleicao = detalhe?.ANO_ELEICAO;
  const cdEleicao = String(detalhe?.CD_ELEICAO || "");
  const municipioNome = detalhe?.NM_MUNICIPIO;
  const ufSigla = String(detalhe?.SG_UF || "")
    .trim()
    .toUpperCase();

  try {
    logger.info(`[Worker] Iniciando processamento`, {
      municipio: municipioNome,
      uf: ufSigla,
      cargo: detalhe?.CD_CARGO,
      turno: detalhe?.NR_TURNO,
    });

    const nomeUF = ESTADOS_BR[ufSigla] || null;
    const cdMunicipio = String(detalhe.CD_MUNICIPIO);
    const nrZona = String(detalhe.NR_ZONA || detalhe.CD_ZONA || "0");

    const abrangencia = normalizarAbr(detalhe.TP_ABRANGENCIA);
    const cdCargo = String(detalhe.CD_CARGO);
    const cdEleicaoArquivo = cdEleicao.padStart(6, "0");

    const baseData = path.join(
      process.cwd(),
      "public",
      `ele${anoEleicao}`,
      cdEleicao,
      "dados",
      ufSigla.toLowerCase()
    );

    const baseTmp = path.join(
      process.cwd(),
      "tmp",
      `ele${anoEleicao}`,
      cdEleicao
    );

    await fs.promises.mkdir(baseData, { recursive: true });
    await fs.promises.mkdir(baseTmp, { recursive: true });

    const nomeArquivoCidade = `${ufSigla.toLowerCase()}${cdMunicipio}-c${cdCargo.padStart(
      4,
      "0"
    )}-e${cdEleicaoArquivo}-u.json`;
    const nomeArquivoZona = `${ufSigla.toLowerCase()}${cdMunicipio}-z${nrZona.padStart(
      4,
      "0"
    )}-c${cdCargo.padStart(4, "0")}-e${cdEleicaoArquivo}-u.json`;

    const caminhoArquivoCidade = path.join(baseData, nomeArquivoCidade);
    const caminhoArquivoZona = path.join(baseData, nomeArquivoZona);

    const totalAptos = numero(detalhe.QT_APTOS);
    const comparecimento = numero(detalhe.QT_COMPARECIMENTO);
    const abstencao =
      numero(detalhe.QT_ABSTENCOES) || Math.max(totalAptos - comparecimento, 0);
    const votosBrancos = numero(detalhe.QT_VOTOS_BRANCOS);
    const votosNulos = numero(detalhe.QT_VOTOS_NULOS);

    const candidatosMap = new Map();

    for (let i = 0; i < candidatos.length; i++) {
      const cand = candidatos[i];
      const sq = gerarSq(cand, detalhe);
      const votosCand = numero(cand.QT_VOTOS_NOMINAIS_VALIDOS);

      const existente = candidatosMap.get(sq);

      if (!existente) {
        candidatosMap.set(sq, {
          ...cand,
          SQ_CANDIDATO: sq,
          QT_VOTOS_NOMINAIS_VALIDOS: votosCand,
        });
      } else {
        existente.QT_VOTOS_NOMINAIS_VALIDOS += votosCand;
      }
    }

    let votosValidos = 0;
    for (const c of candidatosMap.values()) {
      votosValidos += numero(c.QT_VOTOS_NOMINAIS_VALIDOS);
    }

    const totalVotos = votosValidos + votosBrancos + votosNulos;

    const partidos = new Map();
    const todos = [];

    for (const cand of candidatosMap.values()) {
      const nrPartido = String(cand.NR_PARTIDO || "0");

      let partido = partidos.get(nrPartido);

      if (!partido) {
        partido = {
          n: nrPartido,
          sg: texto(cand.SG_PARTIDO).toUpperCase(),
          nm: texto(cand.NM_PARTIDO),
          nrFed:
            numero(cand.NR_FEDERACAO) > 0 ? String(cand.NR_FEDERACAO) : null,
          nmFed: texto(cand.NM_FEDERACAO) || null,
          sgFed: texto(cand.SG_FEDERACAO) || null,
          cand: [],
          tvtn: 0,
        };
        partidos.set(nrPartido, partido);
      }

      const votosCand = numero(cand.QT_VOTOS_NOMINAIS_VALIDOS);
      partido.tvtn += votosCand;

      const pctCand = percentual(votosCand, votosValidos);
      const situacao = texto(cand.DS_SIT_TOT_TURNO);
      const eleito = situacao?.toLowerCase().includes("eleito");
      const segundoTurno =
        situacao?.toLowerCase().includes("2º turno") ||
        situacao?.toLowerCase().includes("2o turno");

      const vsSubs = [];
      if (cand.NM_VICE || cand.NM_URNA_VICE) {
        vsSubs.push({
          tp: "v",
          sqcand: null,
          nm: texto(cand.NM_VICE) || null,
          nmu: texto(cand.NM_URNA_VICE) || null,
          sgp: texto(cand.SG_PARTIDO_VICE) || null,
        });
      }

      const obj = {
        n: String(cand.NR_CANDIDATO),
        sqcand: String(cand.SQ_CANDIDATO),
        nm: texto(cand.NM_CANDIDATO),
        nmu: texto(cand.NM_URNA_CANDIDATO),
        dt: texto(cand.DT_NASCIMENTO) || null,
        dvt: texto(cand.NM_TIPO_DESTINACAO_VOTOS) || null,
        seq: null,
        e: eleito || segundoTurno ? "s" : "n",
        st: situacao || null,
        vap: String(votosCand),
        pvap: formatPct(pctCand),
        pvapn: formatPctN(pctCand),
        vs: vsSubs,
        subs: [],
      };

      partido.cand.push(obj);
      todos.push(obj);
    }

    todos.sort((a, b) => Number(b.vap) - Number(a.vap));
    for (let i = 0; i < todos.length; i++) {
      todos[i].seq = String(i + 1);
    }

    const federacoesMap = new Map();
    const agr = [];

    for (const p of partidos.values()) {
      if (p.nrFed) {
        let fed = federacoesMap.get(p.nrFed);
        if (!fed) {
          fed = {
            n: p.nrFed,
            nm: p.nmFed || "",
            sg: p.sgFed || "",
            com: "",
            npar: [],
            tvtn: 0,
            partidos: [],
          };
          federacoesMap.set(p.nrFed, fed);
        }
        fed.tvtn += p.tvtn;
        fed.npar.push(p.n);
        fed.partidos.push(p);
      } else {
        agr.push({
          n: p.n,
          nm: p.nm,
          tp: "i",
          tvtn: String(p.tvtn),
          tvtl: "0",
          tvan: String(p.tvtn),
          tval: "0",
          vag: null,
          com: p.sg,
          par: [
            {
              n: p.n,
              sg: p.sg,
              nm: p.nm,
              nfed: "",
              tvtn: String(p.tvtn),
              tvtl: "0",
              tvan: String(p.tvtn),
              tval: "0",
              cand: p.cand,
            },
          ],
        });
      }
    }

    for (const fed of federacoesMap.values()) {
      agr.push({
        n: fed.n,
        nm: fed.nm,
        tp: "f",
        tvtn: String(fed.tvtn),
        tvtl: "0",
        tvan: String(fed.tvtn),
        tval: "0",
        vag: null,
        com: fed.sg,
        par: fed.partidos.map((p) => ({
          n: p.n,
          sg: p.sg,
          nm: p.nm,
          nfed: fed.n,
          tvtn: String(p.tvtn),
          tvtl: "0",
          tvan: String(p.tvtn),
          tval: "0",
          cand: p.cand,
        })),
      });
    }

    const feds = [];
    for (const fed of federacoesMap.values()) {
      feds.push({
        n: fed.n,
        nm: fed.nm,
        sg: fed.sg,
        com: fed.com,
        npar: fed.npar,
      });
    }

    const existeEleito = todos.some((c) => c.e === "s");

    const secoes = construirSecoes(detalhe);
    const eleitorado = construirEleitorado(
      detalhe,
      totalAptos,
      comparecimento,
      abstencao
    );
    const votos = construirVotos(
      detalhe,
      votosValidos,
      totalVotos,
      votosBrancos,
      votosNulos
    );

    const jsonBase = {
      ele: cdEleicao,
      t: String(detalhe.NR_TURNO),
      f: "o",
      sup: "n",
      tpabr: abrangencia,
      cdabr: cdMunicipio,
      dg: detalhe.DT_GERACAO || null,
      hg: detalhe.HH_GERACAO || null,
      dv: "s",
      dt: detalhe.DT_ULTIMA_TOTALIZACAO || null,
      ht: detalhe.HH_ULTIMA_TOTALIZACAO || null,
      tf: "s",
      and: "f",
      esae: existeEleito ? "n" : "s",
      mnae: [],
      carg: [
        {
          cd: cdCargo,
          nmn: texto(detalhe.DS_CARGO),
          nmm: texto(detalhe.DS_CARGO),
          nmf: texto(detalhe.DS_CARGO),
          nv: "1",
          fed: feds,
          agr,
        },
      ],
      s: secoes,
      e: eleitorado,
      v: votos,
    };

    await fs.promises.writeFile(
      caminhoArquivoCidade,
      JSON.stringify(jsonBase),
      "utf8"
    );

    const jsonZona = {
      ...jsonBase,
      tpabr: "zona",
      cdabr: nrZona.padStart(4, "0"),
    };

    await fs.promises.writeFile(
      caminhoArquivoZona,
      JSON.stringify(jsonZona),
      "utf8"
    );

    logger.info(`[Worker] Arquivos cidade/zona salvos`, {
      cidade: caminhoArquivoCidade,
      zona: caminhoArquivoZona,
    });

    const cdi = await buscarCodigoIBGE(texto(detalhe.NM_MUNICIPIO), ufSigla);

    await atualizarMunCm(
      anoEleicao,
      cdEleicao,
      cdEleicaoArquivo,
      detalhe.DT_GERACAO || null,
      detalhe.HH_GERACAO || null,
      ufSigla,
      nomeUF,
      cdMunicipio,
      texto(detalhe.NM_MUNICIPIO),
      nrZona,
      cdi
    );

    logger.info(`[Worker] mun-cm atualizado`, {
      municipio: municipioNome,
      uf: ufSigla,
      cdi,
    });

    const eleitosFiltrados = todos.filter((c) => c.e === "s");

    await atualizarEleitos(
      baseData,
      ufSigla,
      nomeUF,
      cdCargo,
      cdEleicaoArquivo,
      cdEleicao,
      detalhe.NR_TURNO,
      detalhe.DT_GERACAO || null,
      detalhe.HH_GERACAO || null,
      detalhe.DT_ULTIMA_TOTALIZACAO || null,
      detalhe.HH_ULTIMA_TOTALIZACAO || null,
      cdMunicipio,
      texto(detalhe.NM_MUNICIPIO),
      votosValidos,
      existeEleito,
      eleitosFiltrados,
      partidos,
      federacoesMap
    );

    await atualizarAbrangencia(
      baseData,
      ufSigla,
      cdEleicaoArquivo,
      cdEleicao,
      detalhe.NR_TURNO,
      detalhe.DT_GERACAO || null,
      detalhe.HH_GERACAO || null,
      detalhe.DT_ULTIMA_TOTALIZACAO || null,
      detalhe.HH_ULTIMA_TOTALIZACAO || null,
      cdMunicipio,
      secoes,
      eleitorado,
      totalAptos,
      comparecimento,
      abstencao
    );

    logger.info(`[Worker] Arquivos eleitos/abrangência atualizados`, {
      municipio: municipioNome,
      uf: ufSigla,
      cargo: cdCargo,
    });

    await atualizarCodigosEleicoes(
      anoEleicao,
      cdEleicao,
      detalhe.NR_TURNO,
      cdCargo,
      detalhe.DS_CARGO
    );

    const resumoMunicipio = {
      uf: ufSigla,
      cdCargo,
      cdEleicao,
      turno: detalhe.NR_TURNO,
      municipio: cdMunicipio,
      nomeMunicipio: texto(detalhe.NM_MUNICIPIO),
      dgGeracao: detalhe.DT_GERACAO || null,
      hgGeracao: detalhe.HH_GERACAO || null,
      dtTotalizacao: detalhe.DT_ULTIMA_TOTALIZACAO || null,
      htTotalizacao: detalhe.HH_ULTIMA_TOTALIZACAO || null,
      totalAptos,
      comparecimento,
      abstencao,
      votosValidos,
      votosBrancos,
      votosNulos,
      totalVotos,
      secoes: {
        ts: numero(detalhe.QT_TOTAL_SECOES),
        sni: numero(detalhe.QT_SECOES_NAO_INSTALADAS),
        esnt: numero(detalhe.QT_ELEITORES_SECOES_NAO_INSTALADAS),
      },
      candidatos: todos.map((c) => ({
        sq: c.sqcand,
        n: c.n,
        nm: c.nm,
        nmu: c.nmu,
        vap: Number(c.vap),
        e: c.e,
        st: c.st,
        dvt: c.dvt,
        vs: c.vs,
        sgp:
          partidos.get(
            [...partidos.entries()].find(([, p]) =>
              p.cand.some((x) => x.sqcand === c.sqcand)
            )?.[0]
          )?.sg || null,
        nrPartido:
          [...partidos.entries()].find(([, p]) =>
            p.cand.some((x) => x.sqcand === c.sqcand)
          )?.[0] || null,
        nmPartido:
          partidos.get(
            [...partidos.entries()].find(([, p]) =>
              p.cand.some((x) => x.sqcand === c.sqcand)
            )?.[0]
          )?.nm || null,
      })),
    };

    const chaveTemp = `${ufSigla.toLowerCase()}-c${cdCargo.padStart(
      4,
      "0"
    )}-e${cdEleicaoArquivo}`;
    const caminhoTempUF = path.join(baseTmp, `${chaveTemp}-tmp-uf.json`);
    const caminhoTempBR = path.join(baseTmp, `${chaveTemp}-tmp-br.json`);

    await acumularTemp(caminhoTempUF, resumoMunicipio);

    const cargosBR = ["1", "01", "0001"];
    if (cargosBR.includes(cdCargo)) {
      await acumularTemp(caminhoTempBR, resumoMunicipio);
    }

    logger.info(`[Worker] Processamento concluído`, {
      municipio: municipioNome,
      uf: ufSigla,
    });

    parentPort.postMessage({
      ok: true,
      estado: ufSigla,
      nomeEstado: nomeUF,
      cidade: {
        codTSE: cdMunicipio,
        nome: String(detalhe.NM_MUNICIPIO || ""),
        zonas:
          nrZona && nrZona !== "0"
            ? [{ [nrZona.padStart(4, "0")]: `${nrZona}ª ZE` }]
            : [],
      },
      resumoEstado: resumoMunicipio,
      tempUF: caminhoTempUF,
      tempBR: cargosBR.includes(cdCargo) ? caminhoTempBR : null,
    });
  } catch (erro) {
    logger.error(`[Worker] Erro processamento cidade`, {
      municipio: municipioNome,
      uf: ufSigla,
      cargo: detalhe?.CD_CARGO,
      erro: erro.message,
      stack: erro.stack,
    });

    await registrarErro(
      anoEleicao,
      cdEleicao,
      {
        municipio: municipioNome,
        uf: ufSigla,
        cargo: detalhe?.CD_CARGO,
        turno: detalhe?.NR_TURNO,
      },
      erro
    );

    parentPort.postMessage({ ok: false, erro: erro.message });
  }
});
