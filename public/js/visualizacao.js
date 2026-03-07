let CODIGOS_ELEICOES = {};

const loadingEl = document.getElementById("loading");
const fallbackEl = document.getElementById("fallback");
const resultsEl = document.getElementById("results");
const candidatesEl = document.getElementById("candidates");
const paginationEl = document.getElementById("pagination");
const headerResultadoEl = document.getElementById("headerResultado");

const totalVotosEl = document.getElementById("totalVotos");
const votosValidosEl = document.getElementById("votosValidos");
const votosNulosEl = document.getElementById("votosNulos");
const votosBrancosEl = document.getElementById("votosBrancos");
const votosAbstencaoEl = document.getElementById("totalAbstencoes");

const filterAno = document.getElementById("filterAno");
const filterTurno = document.getElementById("filterTurno");
const filterEstado = document.getElementById("filterEstado");
const filterMunicipio = document.getElementById("filterMunicipio");
const filterCargo = document.getElementById("filterCargo");
const btnBuscar = document.getElementById("btnBuscar");
const btnLimpar = document.getElementById("btnLimpar");

const formatBR = (val) =>
  !val
    ? "0"
    : Number(val).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

async function carregarCodigosEleicoes() {
  const resp = await fetch("/js/codigos_eleicoes.json");
  CODIGOS_ELEICOES = await resp.json();
  filterAno.innerHTML = '<option value="">Ano</option>';
  Object.keys(CODIGOS_ELEICOES)
    .sort((a, b) => Number(b) - Number(a))
    .forEach((ano) => {
      const opt = document.createElement("option");
      opt.value = ano;
      opt.textContent = ano;
      filterAno.appendChild(opt);
    });
}

function renderApuracao(data) {
  const s = data.s;
  if (!s) return;

  const total = Number(s.ts);
  const apuradas = Number(s.st);
  const percent = Number(s.pstn || s.pst.replace(",", "."));

  document.getElementById("secoesApuradas").textContent = formatBR(apuradas);
  document.getElementById("secoesTotal").textContent = formatBR(total);

  document.getElementById("apuracaoPercent").textContent =
    percent.toFixed(1) + "%";

  const bar = document.getElementById("apuracaoBarFill");

  bar.style.width = "0%";

  setTimeout(() => {
    bar.style.width = percent + "%";
  }, 50);
}

function getCodigoEleicao(ano, turno, cargo) {
  if (!CODIGOS_ELEICOES?.[ano]) return null;

  const cargoStr = String(cargo);

  if (cargoStr === "1") {
    return CODIGOS_ELEICOES[ano]?.federal?.[turno] || null;
  }

  if (
    cargoStr === "3" ||
    cargoStr === "5" ||
    cargoStr === "6" ||
    cargoStr === "7"
  ) {
    return CODIGOS_ELEICOES[ano]?.estadual?.[turno] || null;
  }

  if (cargoStr === "11" || cargoStr === "13") {
    return CODIGOS_ELEICOES[ano]?.municipal?.[turno] || null;
  }

  return null;
}

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    ano: params.get("ano") || "",
    turno: params.get("turno") || "",
    estado: params.get("estado") || "",
    municipio: params.get("municipio") || "",
    cargo: params.get("cargo") || "",
  };
}

function setQueryParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${params.toString()}`
  );
}

async function setAno(ano) {
  filterAno.value = ano;
  filterTurno.innerHTML = '<option value="">Turno</option>';
  filterTurno.disabled = true;
  filterEstado.disabled = true;
  filterMunicipio.disabled = true;
  filterCargo.disabled = true;
  btnBuscar.disabled = true;

  if (!ano) return;

  const turnosDisponiveis = new Set([
    ...Object.keys(CODIGOS_ELEICOES[ano].federal || {}),
    ...Object.keys(CODIGOS_ELEICOES[ano].estadual || {}),
  ]);

  [...turnosDisponiveis]
    .sort((a, b) => Number(a) - Number(b))
    .forEach((key) => {
      if (Number(key) > 2) return;

      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key === "1" ? "1º Turno" : "2º Turno";
      filterTurno.appendChild(opt);
    });
  filterTurno.disabled = false;

  filterCargo.innerHTML = '<option value="">Cargo</option>';
  Object.entries(CODIGOS_ELEICOES[ano].cargos)
    .filter(([_, nome]) => !nome.toLowerCase().includes("vice"))
    .forEach(([key, nome]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = nome;
      filterCargo.appendChild(opt);
    });

  filterEstado.innerHTML = '<option value="">Estado</option>';
  const resp = await fetch("/estados.json");
  const estados = await resp.json();
  estados.sort((a, b) => a.nome.localeCompare(b.nome));
  estados.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.sigla;
    opt.textContent = e.nome;
    filterEstado.appendChild(opt);
  });
}

async function setEstado(uf) {
  filterEstado.value = uf;
  filterMunicipio.innerHTML = '<option value="">Município</option>';
  filterMunicipio.disabled = !uf;
  btnBuscar.disabled = true;
  if (!uf) return;
  const resp = await fetch(`/cidades_${uf}.json`);
  const cidades = await resp.json();
  cidades.sort((a, b) => a.nome.localeCompare(b.nome));
  cidades.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.codTSE;
    opt.textContent = c.nome;
    filterMunicipio.appendChild(opt);
  });
}

async function applyFiltersFromQuery() {
  const filters = getQueryParams();

  if (filters.ano) await setAno(filters.ano);
  if (filters.turno) filterTurno.value = filters.turno;
  if (filters.estado) await setEstado(filters.estado);
  if (filters.municipio) filterMunicipio.value = filters.municipio;
  if (filters.cargo) filterCargo.value = filters.cargo;

  if (
    filters.ano &&
    filters.turno &&
    filters.estado &&
    filters.municipio &&
    filters.cargo
  ) {
    filterCargo.disabled = false;
    btnBuscar.disabled = false;

    if (window.__INITIAL_DATA__) {
      const { data, filters: f } = window.__INITIAL_DATA__;
      renderResultados(data, { ...f, skipCargoFilter: true });
    }
  }
}

function renderCandidatos(data, filters) {
  const candidatos = [];
  if (Array.isArray(data?.carg)) {
    data.carg
      .filter((cargo) => {
        if (filters.skipCargoFilter) return true;
        const codigo = String(cargo?.cd || "");
        const ano = filters.ano;
        if (!CODIGOS_ELEICOES?.[ano]?.cargos?.[codigo]) return false;
        const nomeCargo = CODIGOS_ELEICOES[ano].cargos[codigo];
        return !nomeCargo.toLowerCase().includes("vice");
      })
      .forEach((cargo) => {
        cargo?.agr?.forEach((agr) => {
          agr?.par?.forEach((par) => {
            par?.cand?.forEach((c) => {
              candidatos.push({ ...c, sg: par.sg });
            });
          });
        });
      });
  }

  const candidatosOrdenados = candidatos.sort(
    (a, b) => parseInt(a.seq || 0, 10) - parseInt(b.seq || 0, 10)
  );

  const pageSize = 4;
  let currentPage = 1;

  const renderPage = () => {
    candidatesEl.innerHTML = "";
    const start = (currentPage - 1) * pageSize;
    const pageItems = candidatosOrdenados.slice(start, start + pageSize);

    pageItems.forEach((c) => {
      const perc = parseFloat(String(c.pvapn || "0").replace(",", "."));
      const strokeWidth = 6;
      const radius = 50 - strokeWidth / 2;
      const circumference = 2 * Math.PI * radius;
      const dashOffset = circumference * (1 - perc / 100);

      const circleColor =
        (c.e === "s" && c.e !== "n" && c.st !== "Não Eleito") ||
        c.st === "Eleito"
          ? "#41ec7f"
          : c.st === "2º Turno"
          ? "#efca44"
          : "#6b7280";

      let baseImg = null;
      const isPresidencial = filters.cargo === "1";
      const ufFoto = isPresidencial ? "BR" : filters.estado;

      if (String(filters.ano) === "2024") {
        baseImg = `https://monitor-static.poder360.com.br/static?path=politicos_do_brasil/fotos/2024/${filters.municipio}/candidato${c.sqcand}`;
      } else if (Number(filters.ano) < 2022 && Number(filters.ano) !== 2020) {
        baseImg = `https://monitor-static.poder360.com.br/static?path=eleicoes/media/fotos/${filters.ano}/${ufFoto}/${c.sqcand}`;
      } else {
        baseImg = `https://monitor-static.poder360.com.br/static?path=eleicoes/media/fotos/F${ufFoto}${c.sqcand}_div`;
      }

      const extensions = ["jpg", "jpeg", "png", "webp"];
      const card = document.createElement("div");
      card.classList.add("candidate-card");

      card.innerHTML = `
        <div class="candidate-img-wrapper">
          <img alt="${c.nmu}" />
          <svg viewBox="0 0 100 100" class="candidate-progress">
            <circle
              r="${radius}"
              cx="50"
              cy="50"
              stroke="${circleColor}"
              stroke-width="${strokeWidth}"
              fill="none"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashOffset}"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <div class="candidate-name">${c.nmu}</div>
        <div class="candidate-number">${c.n} - ${c.sg}</div>
        <div class="candidate-votes">
          ${formatBR(c.vap)} votos (${c.pvap}%)
        </div>
        <div class="candidate-status ${
          c.e === "s" && c.st !== "Não Eleito"
            ? "elected"
            : c.st === "2º Turno"
            ? "second-round"
            : "not-elected"
        }">
          ${c.st}
        </div>
      `;

      const img = card.querySelector("img");
      let index = 0;

      const tryLoad = () => {
        if (index >= extensions.length) {
          img.src = "/img/placeholder.png";
          return;
        }
        img.src = `${baseImg}.${extensions[index]}`;
      };

      img.onerror = () => {
        index++;
        tryLoad();
      };

      tryLoad();
      candidatesEl.appendChild(card);
    });

    const renderPagination = () => {
      const totalPages = Math.ceil(candidatosOrdenados.length / pageSize);
      paginationEl.innerHTML = "";
      if (totalPages <= 1) return;

      const maxVisible = 5;

      const createBtn = (label, page, disabled = false, active = false) => {
        const btn = document.createElement("button");
        btn.innerHTML = label;
        btn.className = `btn btn-sm ${
          active ? "btn-success" : "btn-outline-success"
        }`;
        btn.disabled = disabled;
        btn.onclick = () => {
          currentPage = page;
          renderPage();
        };
        return btn;
      };

      const createDots = () => {
        const span = document.createElement("span");
        span.className = "px-2 align-self-center";
        span.textContent = "...";
        return span;
      };

      paginationEl.appendChild(
        createBtn("«", currentPage - 1, currentPage === 1)
      );

      let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
      let end = Math.min(totalPages, start + maxVisible - 1);
      if (end - start < maxVisible - 1)
        start = Math.max(1, end - maxVisible + 1);

      if (start > 1) {
        paginationEl.appendChild(createBtn(1, 1, false, currentPage === 1));
        if (start > 2) paginationEl.appendChild(createDots());
      }

      for (let i = start; i <= end; i++)
        paginationEl.appendChild(createBtn(i, i, false, i === currentPage));

      if (end < totalPages) {
        if (end < totalPages - 1) paginationEl.appendChild(createDots());
        paginationEl.appendChild(
          createBtn(totalPages, totalPages, false, currentPage === totalPages)
        );
      }

      paginationEl.appendChild(
        createBtn("»", currentPage + 1, currentPage === totalPages)
      );
    };

    renderPagination();
  };

  renderPage();
}

function renderResultados(data, filters) {
  const cidadeNome =
    filters.municipioNome ||
    filterMunicipio.options[filterMunicipio.selectedIndex]?.text ||
    "";
  const cargoNome =
    filters.cargoNome ||
    filterCargo.options[filterCargo.selectedIndex]?.text ||
    "";
  const ufSigla = filters.estado;
  headerResultadoEl.innerHTML = `
    <div class="resultado-header">
      <div class="cidade">${cidadeNome}, ${ufSigla}</div>
      <div class="cargo">${cargoNome}</div>
      <div class="update">
        Atualizado ${data?.ht || "-"} • ${data?.dt || "-"}
      </div>
    </div>
  `;
  renderApuracao(data);
  renderEstatisticas(data);
  renderCandidatos(data, filters);
  resultsEl.classList.remove("d-none");
  resultsEl.style.display = "block";
}

function renderEstatisticas(data) {
  const tv = parseFloat(data?.v?.tv || 0);
  const vv = parseFloat(data?.v?.vv || 0);
  const vn = parseFloat(data?.v?.vn || 0);
  const vb = parseFloat(data?.v?.vb || 0);
  const abst = parseFloat(data?.e?.a || 0);
  const pa = data?.e?.pa || 0;
  const pct = (val, total) =>
    total
      ? Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }).format((val / total) * 100)
      : "0,00";
  totalVotosEl.innerHTML = `<div>${formatBR(
    tv
  )}</div><div style="font-size:12px;color:#6c757d;">Fonte dos dados: TSE</div>`;
  votosValidosEl.innerHTML = `<div>${formatBR(
    vv
  )}</div><div style="font-size:12px;color:#6c757d;">${pct(vv, tv)}%</div>`;
  votosNulosEl.innerHTML = `<div>${formatBR(
    vn
  )}</div><div style="font-size:12px;color:#6c757d;">${pct(vn, tv)}%</div>`;
  votosBrancosEl.innerHTML = `<div>${formatBR(
    vb
  )}</div><div style="font-size:12px;color:#6c757d;">${pct(vb, tv)}%</div>`;
  votosAbstencaoEl.innerHTML = `<div>${formatBR(
    abst
  )}</div><div style="font-size:12px;color:#6c757d;">${pa}%</div>`;
}

filterAno?.addEventListener("change", async () => {
  await setAno(filterAno.value);
});

filterTurno?.addEventListener("change", () => {
  filterEstado.disabled = !filterTurno.value;
  filterMunicipio.disabled = true;
  btnBuscar.disabled = true;
});

filterEstado?.addEventListener("change", async () => {
  await setEstado(filterEstado.value);
});

filterMunicipio?.addEventListener("change", () => {
  filterCargo.disabled = !filterMunicipio.value;
  btnBuscar.disabled = !filterMunicipio.value || !filterCargo.value;
});

filterCargo?.addEventListener("change", () => {
  btnBuscar.disabled = !filterCargo.value;
});

btnBuscar?.addEventListener("click", () => {
  const ano = filterAno.value;
  const turno = filterTurno.value;
  const cargo = filterCargo.value;

  const codigoEleicao = getCodigoEleicao(ano, turno, cargo);

  const params = new URLSearchParams({
    ano,
    turno,
    estado: filterEstado.value,
    municipio: filterMunicipio.value,
    cargo,
    eleicao: codigoEleicao,
  });

  window.location.href = `/dados?${params.toString()}`;
});

btnLimpar?.addEventListener("click", () => {
  filterAno.value = "";
  filterTurno.innerHTML = '<option value="">Turno</option>';
  filterTurno.disabled = true;
  filterEstado.value = "";
  filterEstado.disabled = true;
  filterMunicipio.innerHTML = '<option value="">Município</option>';
  filterMunicipio.disabled = true;
  filterCargo.value = "";
  filterCargo.disabled = true;
  btnBuscar.disabled = true;
  candidatesEl.innerHTML = "";
  paginationEl.innerHTML = "";
  resultsEl.classList.add("d-none");
  fallbackEl.style.display = "block";
});

carregarCodigosEleicoes().then(() => applyFiltersFromQuery());
