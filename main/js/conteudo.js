let conteudoGlobal = [];

async function carregarConteudo() {
    const response = await fetch("data/conteudo.json");
    conteudoGlobal = await response.json();
    popularFiltros();
    renderizarConteudo(conteudoGlobal);
}

function renderizarConteudo(lista) {
    const container = document.getElementById("conteudo-container");
    container.innerHTML = "";

    lista.forEach(item => {
        const card = document.createElement("div");
        card.classList.add("card");

        // Badge pela categoria
        let badgeClass = "";
        if (item.categoria.toLowerCase().includes("beat")) badgeClass = "beat";
        else if (item.categoria.toLowerCase().includes("kit")) badgeClass = "kit";
        else badgeClass = "post";

        // Botão Baixar ou Comprar
        let actionButton = item.preco === 0
            ? `<button class="download">⬇ Baixar</button>`
            : `<button class="download">🛒 Comprar</button>`;

        // Botão Play só em beats.html
        let playButton = "";
        if (window.location.pathname.includes("beats.html")) {
            playButton = `<button class="play">▶ Play</button>`;
        }

        // Montagem do card
        card.innerHTML = `
      <img src="${item.capa}" alt="${item.titulo}">
      <div class="card-content">
        <span class="badge ${badgeClass}">${item.categoria}</span>
        <h3 class="accordion-title">${item.titulo}</h3>
        <p><strong>${item.genero}</strong> - ${item.ano}</p>
        <p>${item.descricao}</p>
        <div class="extra"><p>${item.conteudo}</p></div>
        <div class="card-footer">
          ${actionButton}
          ${playButton}
        </div>
      </div>
    `;

        // Accordion no título
        const titulo = card.querySelector(".accordion-title");
        const extra = card.querySelector(".extra");

        titulo.addEventListener("click", () => {
            if (card.classList.contains("active")) {
                card.classList.remove("active");
                extra.style.maxHeight = null;
            } else {
                card.classList.add("active");
                extra.style.maxHeight = extra.scrollHeight + "px";
            }
        });

        container.appendChild(card);
    });
}



function popularFiltros() {
    preencherSelect("filtro-genero", [...new Set(conteudoGlobal.map(i => i.genero))]);
    preencherSelect("filtro-categoria", [...new Set(conteudoGlobal.map(i => i.categoria))]);
    preencherSelect("filtro-ano", [...new Set(conteudoGlobal.map(i => i.ano))]);
    preencherSelect("filtro-tipo", [...new Set(conteudoGlobal.map(i => i.tipo))]);
}

function preencherSelect(id, valores) {
    const select = document.getElementById(id);
    valores.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
    });
}

function aplicarFiltros() {
    const termo = document.getElementById("search").value.toLowerCase();
    const genero = document.getElementById("filtro-genero").value;
    const categoria = document.getElementById("filtro-categoria").value;
    const ano = document.getElementById("filtro-ano").value;
    const tipo = document.getElementById("filtro-tipo").value;

    const filtrados = conteudoGlobal.filter(item =>
        (termo === "" || item.titulo.toLowerCase().includes(termo) ||
            item.descricao.toLowerCase().includes(termo) ||
            item.conteudo.toLowerCase().includes(termo)) &&
        (genero === "" || item.genero === genero) &&
        (categoria === "" || item.categoria === categoria) &&
        (ano === "" || item.ano.toString() === ano) &&
        (tipo === "" || item.tipo === tipo)
    );

    renderizarConteudo(filtrados);
}

document.addEventListener("DOMContentLoaded", () => {
    carregarConteudo();

    document.getElementById("search").addEventListener("input", aplicarFiltros);
    document.getElementById("filtro-genero").addEventListener("change", aplicarFiltros);
    document.getElementById("filtro-categoria").addEventListener("change", aplicarFiltros);
    document.getElementById("filtro-ano").addEventListener("change", aplicarFiltros);
    document.getElementById("filtro-tipo").addEventListener("change", aplicarFiltros);
});
