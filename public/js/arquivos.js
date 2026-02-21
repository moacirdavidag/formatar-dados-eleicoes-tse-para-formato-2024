const tableBody = document.getElementById("filesTable");
const paginationEl = document.getElementById("pagination");

let arquivos = [];
let currentPage = 1;
const pageSize = 5;
let arquivoSelecionado = null;

const formatMB = (bytes) => {
  const mb = bytes / (1024 * 1024);
  return (
    mb.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " MB"
  );
};

const formatDate = (date) => {
  return new Date(date).toLocaleString("pt-BR");
};

const showSnackbar = (msg, success = true) => {
  const el = document.getElementById("snackbar");
  const text = document.getElementById("snackbarText");
  text.textContent = msg;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 3000);
};

const hideSnackbar = () => {
  document.getElementById("snackbar").style.display = "none";
};

const loadFiles = async () => {
  const res = await fetch("/arquivos/listar");
  arquivos = await res.json();
  renderPage();
};

const renderPage = () => {
  tableBody.innerHTML = "";

  const start = (currentPage - 1) * pageSize;
  const items = arquivos.slice(start, start + pageSize);

  items.forEach((f) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${f.nome}</td>
      <td>${formatMB(f.tamanho)}</td>
      <td>${formatDate(f.criadoEm)}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-danger">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    `;

    tr.querySelector("button").onclick = () => {
      arquivoSelecionado = f.nome;
      const modal = new bootstrap.Modal(
        document.getElementById("confirmModal")
      );
      modal.show();
    };

    tableBody.appendChild(tr);
  });

  renderPagination();
};

const renderPagination = () => {
  paginationEl.innerHTML = "";

  const totalPages = Math.ceil(arquivos.length / pageSize);
  if (totalPages <= 1) return;

  const createBtn = (label, page, disabled = false, active = false) => {
    const btn = document.createElement("button");
    btn.textContent = label;
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

  paginationEl.appendChild(createBtn("«", currentPage - 1, currentPage === 1));

  for (let i = 1; i <= totalPages; i++) {
    paginationEl.appendChild(createBtn(i, i, false, i === currentPage));
  }

  paginationEl.appendChild(
    createBtn("»", currentPage + 1, currentPage === totalPages)
  );
};

document.getElementById("confirmDelete").onclick = async () => {
  if (!arquivoSelecionado) return;

  try {
    const res = await fetch(
      `/arquivos/${encodeURIComponent(arquivoSelecionado)}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) throw new Error();

    showSnackbar("Arquivo excluído com sucesso");
    arquivos = arquivos.filter((a) => a.nome !== arquivoSelecionado);
    renderPage();
  } catch {
    showSnackbar("Erro ao excluir arquivo", false);
  }

  const modalEl = document.getElementById("confirmModal");
  const modal = bootstrap.Modal.getInstance(modalEl);
  modal.hide();
};

loadFiles();
