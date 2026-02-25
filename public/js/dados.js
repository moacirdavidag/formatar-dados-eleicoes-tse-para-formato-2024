const form = document.getElementById("uploadForm");
const progressWrapper = document.querySelector(".progress");
const progressBar = document.querySelector(".progress-bar");
const feedback = document.getElementById("feedback");

form?.addEventListener("submit", (e) => {
  e.preventDefault();

  const detalheFile = document.getElementById("detalheCSV").files[0];
  const candidatoFile = document.getElementById("candidatoCSV").files[0];
  const anoEleicao = document.getElementById("anoEleicao").value;

  if (!detalheFile || !candidatoFile) {
    feedback.innerHTML = `<div class="alert alert-danger">Ambos os arquivos são obrigatórios!</div>`;
    return;
  }

  const formData = new FormData();
  formData.append("detalheCSV", detalheFile);
  formData.append("candidatoCSV", candidatoFile);
  formData.append("anoEleicao", anoEleicao);

  progressWrapper.style.display = "block";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";
  feedback.innerHTML = "";

  const xhr = new XMLHttpRequest();
  let lastIndex = 0;

  xhr.onreadystatechange = () => {
    if (xhr.readyState === 3) {
      const chunk = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;

      const lines = chunk.split("\n").filter(Boolean);

      lines.forEach((line) => {
        try {
          const event = JSON.parse(line);

          if (event.progress !== undefined) {
            progressBar.style.width = event.progress + "%";
            progressBar.textContent = event.progress + "%";

            if (event.uf && event.cidade) {
              feedback.innerHTML = `Processando ${event.cidade} (${event.uf})`;
            }
          }
        } catch {}
      });
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      progressBar.style.width = "100%";
      progressBar.textContent = "100%";
      form.reset();

      feedback.innerHTML = `<div class="alert alert-success">
          Importação finalizada! <br>
          Ano da eleição: ${anoEleicao}
        </div>`;
    } else {
      feedback.innerHTML = `<div class="alert alert-danger">Erro no servidor</div>`;
    }
  };

  xhr.onerror = () => {
    feedback.innerHTML = `<div class="alert alert-danger">Erro de conexão</div>`;
  };

  xhr.open("POST", "/importar");
  xhr.send(formData);
});
